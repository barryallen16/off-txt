package expo.modules.offtxtsms

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.provider.Telephony
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.util.Base64
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import kotlin.math.roundToInt

class MissingPermissionException(permission: String) :
  CodedException("Missing permission: $permission")

class SendFailedException(reason: String) :
  CodedException("Could not send SMS: $reason")

/**
 * Sends our own SMS parts without the compose screen, and reads the inbox back
 * so multipart payloads arrive whole instead of truncated by a notification.
 *
 * SEND_SMS and READ_SMS are restricted permissions, so this app is sideloaded
 * rather than published on Play.
 */
class OffTxtSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("React context lost")

  override fun definition() = ModuleDefinition {
    Name("OffTxtSms")

    Function("hasSendPermission") {
      granted(Manifest.permission.SEND_SMS)
    }

    Function("hasReadPermission") {
      granted(Manifest.permission.READ_SMS)
    }

    /**
     * Send every chunk as its own SMS. Concatenating them with
     * sendMultipartTextMessage makes the carrier see one 20-30 segment message,
     * which most SMSCs reject. Independent messages also arrive even when one
     * segment is dropped by the network.
     *
     * @param parts bodies of at most 153 characters each
     * @param simSlot optional SIM slot, null for the default
     * @return number of SMS segments handed to the radio
     */
    AsyncFunction("sendParts") { address: String, parts: List<String>, simSlot: Int? ->
      if (!granted(Manifest.permission.SEND_SMS)) {
        throw MissingPermissionException(Manifest.permission.SEND_SMS)
      }
      if (address.isBlank()) throw SendFailedException("no recipient")
      if (parts.isEmpty()) throw SendFailedException("nothing to send")

      val manager = getSmsManagerForSubscription(simSlot)
      var sent = 0

      try {
        for ((index, part) in parts.withIndex()) {
          if (part.isEmpty()) continue
          val segments = manager.divideMessage(part)

          if (segments.size > 1) {
            // Only payment requests can be longer than one segment. They have
            // to stay one logical message or the UPI link splits apart.
            manager.sendMultipartTextMessage(address, null, segments, null, null)
          } else {
            val intent = Intent(SMS_SENT_ACTION).setPackage(context.packageName)
            val sentIntent = PendingIntent.getBroadcast(
              context,
              index,
              intent,
              PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            manager.sendTextMessage(address, null, part, sentIntent, null)
          }

          sent += segments.size
          // The modem needs a moment between PDUs on some devices. Without
          // this a 25-part picture overruns the buffer and loses segments.
          if (index < parts.lastIndex) Thread.sleep(PART_GAP_MS)
        }
      } catch (error: SecurityException) {
        throw MissingPermissionException(Manifest.permission.SEND_SMS)
      } catch (error: Exception) {
        throw SendFailedException(error.message ?: "radio rejected the message")
      }

      sent
    }

    /**
     * Newest first. Reading the thread is the reliable way to get every part of
     * a multipart message, because notification text is often shortened.
     */
    @SuppressLint("Range")
    AsyncFunction("readRecent") { limit: Int, sinceMillis: Double ->
      if (!granted(Manifest.permission.READ_SMS)) {
        throw MissingPermissionException(Manifest.permission.READ_SMS)
      }

      val since = sinceMillis.toLong()
      val rows = mutableListOf<Map<String, Any>>()
      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )

      val cursor = contentResolver().query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(since.toString()),
        "${Telephony.Sms.DATE} DESC"
      )

      cursor?.use {
        while (it.moveToNext() && rows.size < limit) {
          rows.add(
            mapOf(
              "id" to it.getLong(it.getColumnIndexOrThrow(Telephony.Sms._ID)),
              "address" to (it.getString(it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)) ?: ""),
              "body" to (it.getString(it.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: ""),
              "date" to it.getLong(it.getColumnIndexOrThrow(Telephony.Sms.DATE))
            )
          )
        }
      }

      rows
    }

    /**
     * The recipient picker only needs a name and one number per contact.
     * Querying the phone table directly avoids expo-contacts' full data join
     * and the long bridge payload that comes with it.
     */
    AsyncFunction("readContacts") {
      if (!granted(Manifest.permission.READ_CONTACTS)) {
        throw MissingPermissionException(Manifest.permission.READ_CONTACTS)
      }

      val rows = mutableListOf<Map<String, Any>>()
      val seen = HashSet<String>()
      val projection = arrayOf(
        ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
        ContactsContract.Contacts.DISPLAY_NAME_PRIMARY,
        ContactsContract.CommonDataKinds.Phone.NUMBER,
        ContactsContract.CommonDataKinds.Phone.IS_PRIMARY
      )

      contentResolver().query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        projection,
        null,
        null,
        "${ContactsContract.Contacts.DISPLAY_NAME_PRIMARY} ASC, " +
          "${ContactsContract.CommonDataKinds.Phone.IS_PRIMARY} DESC"
      )?.use { cursor ->
        val idIndex =
          cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
        val nameIndex =
          cursor.getColumnIndexOrThrow(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
        val numberIndex =
          cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)

        while (cursor.moveToNext() && rows.size < 5000) {
          val id = cursor.getLong(idIndex).toString()
          if (seen.contains(id)) continue

          val number = (cursor.getString(numberIndex) ?: "").trim()
          // Contacts saved without a name use the formatted number as their
          // display name. Keep them so the picker can still reach them.
          val name = (cursor.getString(nameIndex) ?: "").trim().ifEmpty { number }
          if (number.isEmpty()) continue

          seen.add(id)
          rows.add(mapOf("id" to id, "name" to name, "number" to number))
        }
      }

      rows
    }

    /**
     * Shrink a picture the way a good offline compressor does: downscale,
     * convert to greyscale, posterise to a few levels, then save a low quality
     * JPEG. A 3 MB photo lands around 2-4 KB, which is a handful of SMS parts.
     */
    AsyncFunction("compressImage") { source: String, maxWidth: Int, quality: Int, levels: Int ->
      // decodeSampled guarantees a mutable ARGB_8888 bitmap. Without that,
      // setPixels throws IllegalStateException on Android.
      val bitmap = decodeSampled(source, maxWidth.coerceIn(64, 2048))

      try {
        val width = bitmap.width
        val height = bitmap.height
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

        val steps = levels.coerceIn(2, 256)
        val step = 255f / (steps - 1)

        for (index in pixels.indices) {
          val pixel = pixels[index]
          val red = (pixel shr 16) and 0xff
          val green = (pixel shr 8) and 0xff
          val blue = pixel and 0xff
          val luminance = 0.299f * red + 0.587f * green + 0.114f * blue
          val grey = (Math.round(luminance / step) * step).coerceIn(0f, 255f).toInt()
          pixels[index] = (0xff shl 24) or (grey shl 16) or (grey shl 8) or grey
        }

        bitmap.setPixels(pixels, 0, width, 0, 0, width, height)

        val output = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(1, 100), output)
        val bytes = output.toByteArray()

        mapOf(
          "base64" to Base64.encodeToString(bytes, Base64.NO_WRAP),
          "width" to width,
          "height" to height,
          "bytes" to bytes.size
        )
      } finally {
        bitmap.recycle()
      }
    }
  }

  private fun toUri(source: String): Uri {
    val value = source.trim()
    if (value.startsWith("content://") || value.startsWith("file://")) {
      return Uri.parse(value)
    }
    return Uri.fromFile(File(value))
  }

  private fun openStream(source: String): InputStream? =
    try {
      context.contentResolver.openInputStream(toUri(source))
    } catch (error: Exception) {
      null
    }

  /** Decode with inSampleSize so a 12 megapixel photo does not blow the heap. */
  private fun decodeSampled(source: String, maxWidth: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openStream(source)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      throw CodedException("Could not read that image")
    }

    var sample = 1
    while (bounds.outWidth / (sample * 2) >= maxWidth) sample *= 2

    val options = BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
      // BitmapFactory returns an immutable bitmap by default. compressImage
      // writes pixels back into it, which throws on an immutable bitmap.
      inMutable = true
    }

    val decoded = openStream(source)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: throw CodedException("Could not read that image")

    val scaled = if (decoded.width <= maxWidth) {
      decoded
    } else {
      val scaledHeight = (decoded.height * (maxWidth.toFloat() / decoded.width))
        .roundToInt()
        .coerceAtLeast(1)
      Bitmap.createScaledBitmap(decoded, maxWidth, scaledHeight, true).also {
        if (it !== decoded) decoded.recycle()
      }
    }

    if (scaled.isMutable) return scaled

    // createScaledBitmap can still return an immutable copy on some OEM
    // builds. Make one final mutable copy before the caller mutates pixels.
    val mutable = scaled.copy(Bitmap.Config.ARGB_8888, true)
      ?: throw CodedException("Could not prepare that image")
    scaled.recycle()
    return mutable
  }

  private fun contentResolver(): ContentResolver =
    context.applicationContext.contentResolver

  private fun granted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) ==
      PackageManager.PERMISSION_GRANTED

  /**
   * Resolve the requested SIM slot. Reading subscription details needs
   * READ_PHONE_STATE; without it we quietly use the default subscription.
   */
  private fun getSmsManagerForSubscription(slotIndex: Int?): SmsManager {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      @Suppress("DEPRECATION")
      return SmsManager.getDefault()
    }

    val base = context.getSystemService(SmsManager::class.java)
      ?: throw SendFailedException("SMS service unavailable")

    if (slotIndex == null ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      return base
    }

    return try {
      val subscriptions = context.getSystemService(SubscriptionManager::class.java)
      val info = subscriptions?.getActiveSubscriptionInfoForSimSlotIndex(slotIndex)
      if (info == null) base else base.createForSubscriptionId(info.subscriptionId)
    } catch (error: Exception) {
      base
    }
  }

  private companion object {
    const val SMS_SENT_ACTION = "expo.modules.offtxtsms.SMS_SENT"
    const val PART_GAP_MS = 60L
  }
}
