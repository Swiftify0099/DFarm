package com.dfarm.collection.domain.receipt

import com.dfarm.collection.domain.model.CollectionReceipt
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ReceiptFormatter {

    private const val LINE_WIDTH = 40

    fun generateReceiptText(receipt: CollectionReceipt): String {
        val sb = StringBuilder()
        val sep = "=".repeat(LINE_WIDTH)
        val dash = "-".repeat(LINE_WIDTH)

        sb.appendLine(centerText("DFARM DAIRY COLLECTION", LINE_WIDTH))
        sb.appendLine(centerText(receipt.centerName.uppercase(), LINE_WIDTH))
        sb.appendLine(sep)
        
        sb.appendLine(formatRow("Date: ${receipt.businessDate}", "Shift: ${receipt.shift}"))
        val timeStr = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date(receipt.timestamp))
        sb.appendLine(formatRow("Time: $timeStr", "Rcpt: ${receipt.receiptNumber}"))
        sb.appendLine(dash)

        sb.appendLine(formatRow("Farmer Code:", receipt.customerCode))
        sb.appendLine(formatRow("Customer:", maskName(receipt.customerName)))
        sb.appendLine(formatRow("Auth Method:", receipt.identificationMethod.name))
        sb.appendLine(dash)

        sb.appendLine(formatRow("Category:", receipt.milkCategory.name))
        sb.appendLine(formatRow("Net Weight:", String.format(Locale.US, "%.2f kg", receipt.weightKg)))
        sb.appendLine(formatRow("Fat %:", String.format(Locale.US, "%.1f %%", receipt.fatPercentage)))
        sb.appendLine(formatRow("SNF %:", String.format(Locale.US, "%.1f %%", receipt.snfPercentage)))
        sb.appendLine(formatRow("Rate / kg:", String.format(Locale.US, "INR %.2f", receipt.ratePerUnit)))
        sb.appendLine(dash)

        sb.appendLine(formatRow("TOTAL AMOUNT:", String.format(Locale.US, "INR %.2f", receipt.totalAmount)))
        sb.appendLine(sep)
        
        sb.appendLine("Session: ${receipt.sessionUuid.take(18)}...")
        sb.appendLine("Operator: ${receipt.operatorName}")
        sb.appendLine("Hash: ${receipt.verificationHash.take(16)}...")
        sb.appendLine(centerText("*** THANK YOU ***", LINE_WIDTH))

        return sb.toString()
    }

    fun computeVerificationHash(receipt: CollectionReceipt): String {
        val payload = "${receipt.sessionUuid}|${receipt.customerCode}|${receipt.weightKg}|${receipt.totalAmount}|${receipt.timestamp}"
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(payload.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun centerText(text: String, width: Int): String {
        if (text.length >= width) return text.take(width)
        val pad = (width - text.length) / 2
        return " ".repeat(pad) + text
    }

    private fun formatRow(left: String, right: String): String {
        val available = LINE_WIDTH - left.length - right.length
        return if (available > 0) {
            left + " ".repeat(available) + right
        } else {
            "$left $right"
        }
    }

    private fun maskName(name: String): String {
        val parts = name.split(" ")
        return parts.joinToString(" ") { p ->
            if (p.length > 2) "${p.take(2)}${"*".repeat(p.length - 2)}" else p
        }
    }
}
