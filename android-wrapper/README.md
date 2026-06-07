# Zostel Cafe Kiosk - Android WebView Wrapper Setup

This is a lightweight Android wrapper that hosts the Next.js Cafe Ordering website in full-screen kiosk mode and bridges receipt notifications directly to a connected Bluetooth thermal printer.

---

## 1. Add Gradle Dependency

To support the modern and secure `WebViewCompat.addWebMessageListener` API, add the following dependency to your **`app/build.gradle`** (or `app/build.gradle.kts`):

```kotlin
dependencies {
    // ... other dependencies
    
    // Required for web message listener bridge
    implementation("androidx.webkit:webkit:1.8.0")
}
```

---

## 2. Configure Manifest Permissions

Add the following permissions to your **`app/src/main/AndroidManifest.xml`** inside the `<manifest>` tag:

```xml
<!-- Internet Access for WebView -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Bluetooth Access for Printer Communication -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />

<!-- Required for Android 12 (API 31) and higher -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
                 android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

---

## 3. How to Pair and Test

1. **Turn on the Thermal Printer**: Ensure your 58mm/80mm Bluetooth thermal printer is powered on and discoverable.
2. **Pair Device**: Open your Android tablet or phone settings, search for Bluetooth devices, and pair with the printer (typical names include `RPP02N`, `MTP-II`, `T12`, or `Printer`). Use pairing PIN `0000` or `1200` if prompted.
3. **Run the App**: Launch this Kotlin project. The app will automatically request Bluetooth connection privileges, initialize the `androidBridge` JavaScript callback interface, and open the cafe menu.
4. **Checkout**: When you complete a transaction, the success screen will trigger the printer.
