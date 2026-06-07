package com.zostel.kiosk

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : AppCompatActivity() {

    private val TAG = "ZostelMainActivity"
    private val PERMISSION_REQUEST_CODE = 101
    
    private lateinit var webView: WebView
    private lateinit var printerManager: PrinterManager

    // Update with your deployed Next.js URL
    private val DEPLOYED_URL = "https://zostel-ooty-cafe.vercel.app"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Setup simple layout with webview directly
        webView = WebView(this)
        setContentView(webView)

        printerManager = PrinterManager(this)

        setupWebView()
        checkPermissionsAndBindBridge()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        
        // Adjust viewport sizing behavior
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "WebView loaded page: $url")
            }
        }

        // Full screen kiosk mode configuration
        supportActionBar?.hide()
    }

    private fun checkPermissionsAndBindBridge() {
        val requiredPermissions = mutableListOf<String>()

        // Request Bluetooth permissions dynamically based on API level (required for Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requiredPermissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            requiredPermissions.add(Manifest.permission.BLUETOOTH_SCAN)
        } else {
            requiredPermissions.add(Manifest.permission.BLUETOOTH)
            requiredPermissions.add(Manifest.permission.BLUETOOTH_ADMIN)
        }

        // Check which permissions need to be requested
        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                missingPermissions.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        } else {
            // Already have permissions, secure the bridge and navigate
            bindWebMessageListener()
            webView.loadUrl(DEPLOYED_URL)
        }
    }

    private fun bindWebMessageListener() {
        // Confirm WebViewcompat supports web messages
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // Define origins allowed to talk to native wrapper. 
            // "*" permits any origin (recommended in local development). In production, replace with setOf(DEPLOYED_URL).
            val allowedOrigins = setOf("*")

            WebViewCompat.addWebMessageListener(
                webView,
                "androidBridge", // Binds to window.androidBridge
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
                        Log.d(TAG, "Received message from WebView Origin: $sourceOrigin. Payload: $payload")
                        
                        if (payload != null) {
                            // Forward the JSON print string to the Bluetooth manager
                            printerManager.printReceipt(payload)
                        }
                    }
                }
            )
            Log.d(TAG, "WebMessageListener 'androidBridge' initialized successfully.")
        } else {
            Log.e(TAG, "WEB_MESSAGE_LISTENER feature is not supported on this device's WebView version.")
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            // Proceed even if user denied (but print will fail if they did). 
            // Binding is safer to execute regardless.
            bindWebMessageListener()
            webView.loadUrl(DEPLOYED_URL)
        }
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
