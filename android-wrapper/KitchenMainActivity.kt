package com.zostel.kiosk

import android.annotation.SuppressLint
import android.app.AlertDialog
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class KitchenMainActivity : AppCompatActivity() {

    private val TAG = "KitchenMainActivity"
    private lateinit var webView: WebView
    private var mediaPlayer: MediaPlayer? = null

    // Update with your deployed Next.js Kitchen URL
    private val KITCHEN_URL = "https://zostel-ooty-cafe.vercel.app/kitchen"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Setup webview layout directly
        webView = WebView(this)
        setContentView(webView)

        setupWebView()
        bindKitchenBridge()
        webView.loadUrl(KITCHEN_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        
        // Settings for smooth viewport sizing
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "WebView loaded page: $url")
            }
        }
        
        // Hide standard Android action bar for kiosk interface feel
        supportActionBar?.hide()
    }

    private fun bindKitchenBridge() {
        // Confirm WebViewcompat supports web messages
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            val allowedOrigins = setOf("*") // Allow all origins for dev; replace with specific domain if needed

            WebViewCompat.addWebMessageListener(
                webView,
                "kitchenBridge", // Binds to window.kitchenBridge
                allowedOrigins,
                object : WebViewCompat.WebMessageListener {
                    override fun onPostMessage(
                        view: WebView,
                        message: WebMessageCompat,
                        sourceOrigin: Uri,
                        isMainFrame: Boolean,
                        replyProxy: JavaScriptReplyProxy
                    ) {
                        val payload = message.data
                        Log.d(TAG, "Received message from WebView. Payload: $payload")
                        if (payload != null) {
                            handleWebMessage(payload)
                        }
                    }
                }
            )
            Log.d(TAG, "WebMessageListener 'kitchenBridge' initialized successfully.")
        } else {
            Log.e(TAG, "WEB_MESSAGE_LISTENER feature is not supported on this device.")
        }
    }

    private fun handleWebMessage(messageJson: String) {
        try {
            val json = org.json.JSONObject(messageJson)
            val type = json.optString("type")
            when (type) {
                "NEW_ORDER" -> {
                    // Full native handling: play alarm + show native dialog
                    val customerName = json.optString("customer_name", "Customer")
                    val totalAmount = json.optDouble("total_amount", 0.0)
                    val itemsSummary = json.optString("items_summary", "Order Details")
                    runOnUiThread {
                        playAlarmSound()
                        showNewOrderDialog(customerName, totalAmount, itemsSummary)
                    }
                }
                "PLAY_SOUND_ONLY" -> {
                    // Only play alarm — web page handles the popup UI itself
                    runOnUiThread {
                        playAlarmSound()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing web message payload", e)
        }
    }

    private fun playAlarmSound() {
        try {
            if (mediaPlayer == null) {
                // Fetch the default system alarm sound, fall back to ringtone if alarm is not available
                val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                mediaPlayer = MediaPlayer.create(this, alarmUri).apply {
                    isLooping = true
                    start()
                }
                Log.d(TAG, "Alarm sound started playing.")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize or play alarm sound", e)
        }
    }

    private fun stopAlarmSound() {
        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.release()
                Log.d(TAG, "Alarm sound stopped.")
            }
            mediaPlayer = null
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop alarm sound", e)
        }
    }

    private fun showNewOrderDialog(customerName: String, amount: Double, itemsSummary: String) {
        AlertDialog.Builder(this)
            .setTitle("New Order Received!")
            .setMessage("Customer: $customerName\nAmount: ₹$amount\n\nItems:\n$itemsSummary")
            .setCancelable(false)
            .setPositiveButton("OK") { dialog, _ ->
                stopAlarmSound()
                dialog.dismiss()
                // Notify the web view that the native dialog was dismissed so it clears its state/Web modal
                webView.post {
                    webView.evaluateJavascript("window.onNativeDialogDismissed?.()", null)
                }
            }
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAlarmSound()
    }

    // Capture hardware back button inside WebView
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
