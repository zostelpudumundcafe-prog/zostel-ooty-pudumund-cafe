# Zostel Cafe Android WebView Wrapper Apps

This directory contains two lightweight Android WebView wrappers:

1. **`MainActivity.kt` (Kiosk/Customer Ordering App)**: Loads the client menu interface and bridges receipt data to a connected Bluetooth thermal printer.
2. **`KitchenMainActivity.kt` (Kitchen/Admin Queue App)**: Loads the kitchen active orders dashboard (`/kitchen`), plays a looping audio alert (system alarm or ringtone) on new orders, and displays a native alert dialog.

---

## 1. Gradle Dependencies

To support the secure `WebViewCompat.addWebMessageListener` API, add the webkit dependency to your **`app/build.gradle`** (or `app/build.gradle.kts`):

```kotlin
dependencies {
    // ... other dependencies
    
    // Required for web-to-native message listener bridge
    implementation("androidx.webkit:webkit:1.8.0")
}
```

---

## 2. Configure AndroidManifest.xml

Add the following permissions inside the `<manifest>` tag of your **`app/src/main/AndroidManifest.xml`**:

```xml
<!-- Internet Access for WebView -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Bluetooth Access for Printer Communication (Only needed for Kiosk MainActivity.kt) -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />

<!-- Required for Android 12 (API 31) and higher -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
                 android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

Define the two activities:

```xml
<application ...>
    <!-- Kiosk Customer App Activity -->
    <activity android:name=".MainActivity"
              android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent-filter>
    </activity>

    <!-- Kitchen Dashboard App Activity -->
    <activity android:name=".KitchenMainActivity"
              android:exported="true">
        <!-- Add standard launching configurations as needed if compiling as a separate application launcher -->
    </activity>
</application>
```

---

## 3. How the Kitchen Wrapper Works

1. **URL Loading**: `KitchenMainActivity.kt` loads the `/kitchen` path (e.g., `https://zostel-ooty-cafe.vercel.app/kitchen`).
2. **Auth Preservation**: Kitchen staff sign in once using the admin credentials. The WebView automatically stores session cookies, keeping them logged in.
3. **Incoming Orders Alerts**:
   - The web app listens in real-time to incoming paid orders.
   - When a new order occurs, the web app calls `window.kitchenBridge.postMessage(...)`.
   - The Android wrapper catches this message, starts playing the default system alarm on a loop, and displays a native popup.
   - Tapping **OK** silences the alarm, dismisses the popup, and returns the view to the pending orders queue.
4. **Completion Flow**: When kitchen staff complete preparing an order, they tap **Mark as Done** directly on the web card. This updates the order status to `completed` in Supabase, removing it from the pending queue.

