package com.zostel.kiosk

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

class PrinterManager(private val context: Context) {

    private val TAG = "PrinterManager"
    
    // Standard Bluetooth Serial Port Profile (SPP) UUID
    private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    
    // ESC/POS Command Constants
    private val ESC_ALIGN_LEFT = byteArrayOf(0x1B, 0x61, 0x00)
    private val ESC_ALIGN_CENTER = byteArrayOf(0x1B, 0x61, 0x01)
    private val ESC_ALIGN_RIGHT = byteArrayOf(0x1B, 0x61, 0x02)
    private val ESC_FONT_BOLD_ON = byteArrayOf(0x1B, 0x45, 0x01)
    private val ESC_FONT_BOLD_OFF = byteArrayOf(0x1B, 0x45, 0x00)
    private val ESC_FONT_DOUBLE_SIZE = byteArrayOf(0x1D, 0x21, 0x11) // Double height & width
    private val ESC_FONT_NORMAL_SIZE = byteArrayOf(0x1D, 0x21, 0x00)
    private val ESC_INIT = byteArrayOf(0x1B, 0x40)
    private val ESC_FEED_PAPER = byteArrayOf(0x1B, 0x64, 0x04) // Feed 4 lines
    private val ESC_PAPER_CUT = byteArrayOf(0x1D, 0x56, 0x41, 0x00) // GS V 65 0 (Full Cut)

    /**
     * Parse receipt payload and push print task to standard Bluetooth thermal printer
     */
    @SuppressLint("MissingPermission")
    fun printReceipt(jsonPayload: String) {
        val bluetoothAdapter = BluetoothAdapter.getDefaultAdapter()
        if (bluetoothAdapter == null) {
            Log.e(TAG, "Bluetooth not supported on this device.")
            return
        }

        if (!bluetoothAdapter.isEnabled) {
            Log.w(TAG, "Bluetooth is disabled. Please enable it.")
            return
        }

        // 1. Get paired devices and look for a typical thermal printer (often named 'T12', 'RPP02N', 'MTP-II', 'Printer')
        val pairedDevices: Set<BluetoothDevice> = bluetoothAdapter.bondedDevices
        var targetDevice: BluetoothDevice? = null

        for (device in pairedDevices) {
            val name = device.name.lowercase()
            if (name.contains("printer") || name.contains("thermal") || name.contains("pos") || name.contains("mpt") || name.contains("rpp")) {
                targetDevice = device
                break
            }
        }

        // Fallback: If no explicitly named printer is found, pick the first paired device
        if (targetDevice == null && pairedDevices.isNotEmpty()) {
            targetDevice = pairedDevices.iterator().next()
        }

        if (targetDevice == null) {
            Log.e(TAG, "No paired Bluetooth printer found. Please pair the thermal printer first.")
            return
        }

        Log.d(TAG, "Attempting connection to printer device: ${targetDevice.name} (${targetDevice.address})")

        // 2. Open standard socket asynchronously to prevent UI freezing
        Thread {
            var socket: BluetoothSocket? = null
            try {
                socket = targetDevice.createRfcommSocketToServiceRecord(SPP_UUID)
                socket.connect()
                
                val outputStream = socket.outputStream
                writeReceiptData(outputStream, jsonPayload)
                
                outputStream.flush()
                Log.d(TAG, "Receipt print job submitted successfully.")
            } catch (e: IOException) {
                Log.e(TAG, "Error connecting or printing: ${e.message}", e)
            } finally {
                try {
                    socket?.close()
                } catch (e: IOException) {
                    Log.e(TAG, "Error closing socket: ${e.message}")
                }
            }
        }.start()
    }

    /**
     * Formats the JSON string into raw ESC/POS byte arrays and writes them to the print stream.
     */
    private fun writeReceiptData(out: OutputStream, jsonString: String) {
        try {
            val order = JSONObject(jsonString)
            val orderId = order.getString("order_id").substring(0, 8).uppercase()
            val customerName = order.getString("customer_name")
            val customerMobile = order.getString("customer_mobile")
            val totalAmount = order.getDouble("total_amount")
            val itemsArray = order.getJSONArray("items")

            // Initialize Printer
            out.write(ESC_INIT)
            
            // Header - Large Centered Bold
            out.write(ESC_ALIGN_CENTER)
            out.write(ESC_FONT_DOUBLE_SIZE)
            out.write(ESC_FONT_BOLD_ON)
            out.write("ZOSTEL CAFE\n".toByteArray())
            out.write(ESC_FONT_NORMAL_SIZE)
            out.write("Ooty Pudumund\n".toByteArray())
            out.write(ESC_FONT_BOLD_OFF)
            out.write("--------------------------------\n".toByteArray()) // 32 Character border
            
            // Order Metadata
            out.write(ESC_ALIGN_LEFT)
            out.write("Order: #$orderId\n".toByteArray())
            out.write("Name:  $customerName\n".toByteArray())
            out.write("Mob:   +91 $customerMobile\n".toByteArray())
            out.write("--------------------------------\n".toByteArray())
            
            // Items Table Headers
            out.write(ESC_FONT_BOLD_ON)
            out.write("Item             Qty       Price\n".toByteArray())
            out.write(ESC_FONT_BOLD_OFF)
            out.write("--------------------------------\n".toByteArray())
            
            // Loop Items
            for (i in 0 until itemsArray.length()) {
                val item = itemsArray.getJSONObject(i)
                val name = item.getString("name")
                val qty = item.getInt("quantity")
                val price = item.getDouble("price") * qty
                
                // Format line spacing for 32 columns:
                // Name (16 chars) + Qty (6 chars) + Price (10 chars)
                val namePart = if (name.length > 15) name.substring(0, 15) else name
                val namePadded = namePart.padEnd(16, ' ')
                val qtyPadded = "x$qty".padEnd(6, ' ')
                val priceString = "INR ${price.toInt()}".padStart(10, ' ')
                
                out.write("$namePadded$qtyPadded$priceString\n".toByteArray())
            }
            
            out.write("--------------------------------\n".toByteArray())
            
            // Grand Total
            out.write(ESC_ALIGN_RIGHT)
            out.write(ESC_FONT_BOLD_ON)
            out.write("GRAND TOTAL: INR ${totalAmount.toInt()}\n".toByteArray())
            out.write(ESC_FONT_BOLD_OFF)
            out.write("--------------------------------\n".toByteArray())
            
            // Footer message
            out.write(ESC_ALIGN_CENTER)
            out.write("Paid via UPI / Razorpay\n".toByteArray())
            out.write(ESC_FONT_BOLD_ON)
            out.write("Live Free. Zostel.\n".toByteArray())
            out.write(ESC_FONT_BOLD_OFF)
            
            // Feed paper and cut
            out.write(ESC_FEED_PAPER)
            out.write(ESC_PAPER_CUT)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to build ESC/POS payload", e)
        }
    }
}
