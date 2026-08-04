// Generic BLE GATT inspection helpers used by the board-lab page. Since Web
// Bluetooth requires a service's UUID to be known in advance (it will not
// let a page enumerate arbitrary services on a device), the actual UUID
// must first be found with an external tool (e.g. nRF Connect). Once known,
// this module handles connecting, subscribing to every notifying
// characteristic, and turning received bytes into a labelable log entry.

export interface RawNotification {
  id: string;
  atMs: number; // ms since capture session start
  serviceUuid: string;
  characteristicUuid: string;
  bytesHex: string;
  bytesDecimal: number[];
  label: { segment: number; multiplier: 0 | 1 | 2 | 3; score: number } | null;
}

export function parseUuidList(input: string): string[] {
  return input
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function formatBytes(view: DataView): { hex: string; decimal: number[] } {
  const bytes: number[] = [];
  for (let i = 0; i < view.byteLength; i++) bytes.push(view.getUint8(i));
  return {
    hex: bytes.map((b) => b.toString(16).padStart(2, '0')).join(' '),
    decimal: bytes,
  };
}

export interface ConnectedBoard {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  subscribedCharacteristics: BluetoothRemoteGATTCharacteristic[];
}

/**
 * Connects to a user-selected device and subscribes to every
 * notify/indicate characteristic under the given (pre-authorized) service
 * UUIDs. `onNotification` fires for every value change on any of them.
 */
export async function connectAndSubscribe(
  serviceUuids: string[],
  onNotification: (serviceUuid: string, characteristicUuid: string, value: DataView) => void,
): Promise<ConnectedBoard> {
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: serviceUuids,
  });

  if (!device.gatt) throw new Error('この端末はGATT接続に対応していません');
  const server = await device.gatt.connect();

  const subscribed: BluetoothRemoteGATTCharacteristic[] = [];
  for (const serviceUuid of serviceUuids) {
    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(serviceUuid);
    } catch {
      continue; // this device doesn't expose that particular service; skip
    }
    const characteristics = await service.getCharacteristics();
    for (const characteristic of characteristics) {
      if (!characteristic.properties.notify && !characteristic.properties.indicate) continue;
      characteristic.addEventListener('characteristicvaluechanged', () => {
        const value = characteristic.value;
        if (value) onNotification(serviceUuid, characteristic.uuid, value);
      });
      await characteristic.startNotifications();
      subscribed.push(characteristic);
    }
  }

  return { device, server, subscribedCharacteristics: subscribed };
}

export async function disconnectBoard(board: ConnectedBoard): Promise<void> {
  for (const c of board.subscribedCharacteristics) {
    try {
      await c.stopNotifications();
    } catch {
      // device may already be gone; ignore
    }
  }
  board.device.gatt?.disconnect();
}
