package expo.modules.oqcyclassic

import android.annotation.SuppressLint
import android.bluetooth.BluetoothA2dp
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Estado do Bluetooth clássico (A2DP/HFP/ACL) para o oqcy.
 * O app original não tinha isso: dependia de achar o fone por varredura BLE e por isso
 * "não reconhecia" um fone que o sistema já tinha conectado.
 */
@SuppressLint("MissingPermission")
class OqcyClassicModule : Module() {
  private val context: Context get() = appContext.reactContext ?: error("React context lost")
  private var registered = false
  private val proxies = HashMap<Int, BluetoothProfile>()

  private val adapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
      val action = intent.action ?: return
      if (action == BluetoothAdapter.ACTION_STATE_CHANGED) {
        val on = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1) == BluetoothAdapter.STATE_ON
        sendEvent("onChange", mapOf("mac" to "", "name" to "", "source" to "adapter", "connected" to on))
        return
      }
      val device = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        else @Suppress("DEPRECATION") intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)) ?: return
      val (source, connected) = when (action) {
        BluetoothDevice.ACTION_ACL_CONNECTED -> "acl" to true
        BluetoothDevice.ACTION_ACL_DISCONNECTED -> "acl" to false
        BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED ->
          "a2dp" to (intent.getIntExtra(BluetoothProfile.EXTRA_STATE, 0) == BluetoothProfile.STATE_CONNECTED)
        BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED ->
          "headset" to (intent.getIntExtra(BluetoothProfile.EXTRA_STATE, 0) == BluetoothProfile.STATE_CONNECTED)
        else -> return
      }
      sendEvent("onChange", mapOf("mac" to device.address, "name" to (device.name ?: ""), "source" to source, "connected" to connected))
    }
  }

  private fun connectedAddresses(): Set<String> =
    proxies.values.flatMap { p -> runCatching { p.connectedDevices }.getOrDefault(emptyList()) }.map { it.address }.toSet()

  private fun start() {
    if (registered) return
    val filter = IntentFilter().apply {
      addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
      addAction(BluetoothA2dp.ACTION_CONNECTION_STATE_CHANGED)
      addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED)
    }
    if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    else context.registerReceiver(receiver, filter)
    registered = true

    val listener = object : BluetoothProfile.ServiceListener {
      override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) { proxies[profile] = proxy }
      override fun onServiceDisconnected(profile: Int) { proxies.remove(profile) }
    }
    for (p in intArrayOf(BluetoothProfile.A2DP, BluetoothProfile.HEADSET)) adapter?.getProfileProxy(context, listener, p)
  }

  private fun stop() {
    if (registered) runCatching { context.unregisterReceiver(receiver) }
    registered = false
    proxies.forEach { (p, proxy) -> runCatching { adapter?.closeProfileProxy(p, proxy) } }
    proxies.clear()
  }

  override fun definition() = ModuleDefinition {
    Name("OqcyClassic")
    Events("onChange")

    OnDestroy { stop() }

    /** Registra os receivers. Chamar depois de BLUETOOTH_CONNECT concedido; é idempotente. */
    Function("start") { start() }

    /** Dispositivos pareados no sistema e se estão conectados (A2DP/HFP) agora. */
    Function("getBonded") {
      val connected = connectedAddresses()
      (adapter?.bondedDevices ?: emptySet()).map {
        mapOf("mac" to it.address, "name" to (it.name ?: ""), "connected" to (it.address in connected))
      }
    }
  }
}
