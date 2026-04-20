#!/usr/bin/env python3

import dbus
import dbus.exceptions
import dbus.mainloop.glib
import dbus.service
import os
from gi.repository import GLib

BLUEZ_SERVICE_NAME = 'org.bluez'
ADAPTER_IFACE = 'org.bluez.Adapter1'
GATT_MANAGER_IFACE = 'org.bluez.GattManager1'
LE_ADVERTISING_MANAGER_IFACE = 'org.bluez.LEAdvertisingManager1'

SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0'
CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1'
DESC_UUID = '2901'
DEVICE_NAME = 'EInkReceiver'
ZIP_OUTPUT_PATH = os.path.expanduser('~/eink_receiver/scripts/incoming_zips/incoming.zip')

mainloop = None

class Application(dbus.service.Object):
    def __init__(self, bus):
        self.path = '/org/bluez/example/app'
        self.services = []
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def add_service(self, service):
        self.services.append(service)

    @dbus.service.method('org.freedesktop.DBus.ObjectManager',
                         in_signature='', out_signature='a{oa{sa{sv}}}')
    def GetManagedObjects(self):
        print("[DBG] GetManagedObjects() called")
        response = {}
        for service in self.services:
            response[service.get_path()] = service.get_properties()
            for char in service.characteristics:
                response[char.get_path()] = char.get_properties()
                for desc in char.descriptors:
                    response[desc.get_path()] = desc.get_properties()
        return response

class Service(dbus.service.Object):
    PATH_BASE = '/org/bluez/example/service'

    def __init__(self, bus, index, uuid):
        self.path = self.PATH_BASE + str(index)
        self.uuid = uuid
        self.characteristics = []
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def add_characteristic(self, characteristic):
        self.characteristics.append(characteristic)

    def get_properties(self):
        return {
            'org.bluez.GattService1': {
                'UUID': self.uuid,
                'Primary': True,
            }
        }

    @dbus.service.method('org.freedesktop.DBus.Properties',
                         in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface == 'org.bluez.GattService1':
            return self.get_properties()['org.bluez.GattService1']
        return {}

class Characteristic(dbus.service.Object):
    def __init__(self, bus, index, uuid, flags, service):
        self.path = service.path + '/char' + str(index)
        self.uuid = uuid
        self.flags = flags
        self.service = service
        self.descriptors = []
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def add_descriptor(self, descriptor):
        self.descriptors.append(descriptor)

    def get_properties(self):
        return {
            'org.bluez.GattCharacteristic1': {
                'UUID': self.uuid,
                'Service': self.service.get_path(),
                'Flags': dbus.Array(self.flags, signature='s')
            }
        }

    @dbus.service.method('org.freedesktop.DBus.Properties',
                         in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface == 'org.bluez.GattCharacteristic1':
            return self.get_properties()['org.bluez.GattCharacteristic1']
        return {}

class Descriptor(dbus.service.Object):
    def __init__(self, bus, index, uuid, characteristic):
        self.path = characteristic.path + '/desc' + str(index)
        self.uuid = uuid
        self.characteristic = characteristic
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def get_properties(self):
        return {
            'org.bluez.GattDescriptor1': {
                'UUID': self.uuid,
                'Characteristic': self.characteristic.get_path(),
                'Value': dbus.Array([dbus.Byte(c) for c in b'Write a ZIP here'], signature='y'),
                'Flags': dbus.Array(['read'], signature='s')
            }
        }

    @dbus.service.method('org.freedesktop.DBus.Properties',
                         in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface == 'org.bluez.GattDescriptor1':
            return self.get_properties()['org.bluez.GattDescriptor1']
        return {}

class ZipWriterCharacteristic(Characteristic):
    def __init__(self, bus, index, service):
        super().__init__(bus, index, CHAR_UUID, ['write', 'write-without-response'], service)
        self.value = bytearray()
        self.total_received = 0
        self.first_write_logged = False

    @dbus.service.method('org.bluez.GattCharacteristic1',
                         in_signature='aya{sv}', out_signature='')
    def WriteValue(self, value, options):
        if not self.first_write_logged:
            print(f"[↓] Started receiving BLE data...")
            self.first_write_logged = True

        self.value += bytes(value)
        self.total_received += len(value)

        if len(value) < 20:
            os.makedirs(os.path.dirname(ZIP_OUTPUT_PATH), exist_ok=True)
            with open(ZIP_OUTPUT_PATH, 'wb') as f:
                f.write(self.value)

            print(f"[✓] Transfer complete: {self.total_received} bytes")
            print(f"[✓] Saved ZIP to: {ZIP_OUTPUT_PATH}")

            self.value = bytearray()
            self.total_received = 0
            self.first_write_logged = False

class Advertisement(dbus.service.Object):
    PATH_BASE = '/org/bluez/example/advertisement'

    def __init__(self, bus, index):
        self.path = self.PATH_BASE + str(index)
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    @dbus.service.method('org.freedesktop.DBus.Properties',
                         in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface):
        if interface != 'org.bluez.LEAdvertisement1':
            raise dbus.exceptions.DBusException(
                'org.freedesktop.DBus.Error.InvalidArgs',
                'No such interface %s' % interface)
        return {
            'Type': 'peripheral',
            'LocalName': DEVICE_NAME,
            'ServiceUUIDs': dbus.Array([SERVICE_UUID], signature='s'),
            'Includes': dbus.Array(['tx-power'], signature='s')
        }

    @dbus.service.method('org.bluez.LEAdvertisement1')
    def Release(self):
        print('[-] Advertisement released')

def register_app_cb():
    print('[*] GATT application registered')

def register_app_error_cb(error):
    print(f'[!] Failed to register application: {error}')
    mainloop.quit()

def register_ad_cb():
    print('[*] Advertisement registered')

def register_ad_error_cb(error):
    print(f'[!] Failed to register advertisement: {error}')
    mainloop.quit()

def main():
    global mainloop

    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()

    adapter = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, '/org/bluez/hci0'), ADAPTER_IFACE)
    adapter_props = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, '/org/bluez/hci0'), 'org.freedesktop.DBus.Properties')
    adapter_props.Set(ADAPTER_IFACE, 'Alias', dbus.String(DEVICE_NAME))
    adapter_props.Set(ADAPTER_IFACE, 'Powered', dbus.Boolean(1))

    app = Application(bus)

    service = Service(bus, 0, SERVICE_UUID)
    char = ZipWriterCharacteristic(bus, 0, service)
    desc = Descriptor(bus, 0, DESC_UUID, char)
    char.add_descriptor(desc)
    service.add_characteristic(char)
    app.add_service(service)

    ad = Advertisement(bus, 0)

    gatt_manager = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, '/org/bluez/hci0'), GATT_MANAGER_IFACE)
    ad_manager = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, '/org/bluez/hci0'), LE_ADVERTISING_MANAGER_IFACE)

    gatt_manager.RegisterApplication(app.get_path(), {},
                                     reply_handler=register_app_cb,
                                     error_handler=register_app_error_cb)

    ad_manager.RegisterAdvertisement(ad.get_path(), {},
                                     reply_handler=register_ad_cb,
                                     error_handler=register_ad_error_cb)

    mainloop = GLib.MainLoop()
    mainloop.run()

if __name__ == '__main__':
    main()
