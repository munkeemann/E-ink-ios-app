
#!/usr/bin/env python3

import dbus
import dbus.exceptions
import dbus.mainloop.glib
import dbus.service
import os
from gi.repository import GLib

SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0'
CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1'
ZIP_OUTPUT_PATH = '/opt/deck_receiver/incoming.zip'

BLUEZ_SERVICE_NAME = 'org.bluez'
GATT_MANAGER_IFACE = 'org.bluez.GattManager1'
ADAPTER_PATH = '/org/bluez/hci0'

mainloop = None

class Application(dbus.service.Object):
    def __init__(self, bus):
        self.path = '/'
        self.services = []
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def add_service(self, service):
        self.services.append(service)

    @dbus.service.method('org.freedesktop.DBus.ObjectManager',
                         out_signature='a{oa{sa{sv}}}')
    def GetManagedObjects(self):
        response = {}
        for service in self.services:
            response[service.get_path()] = service.get_properties()
            for char in service.characteristics:
                response[char.get_path()] = char.get_properties()
        return response

class Service(dbus.service.Object):
    PATH_BASE = '/org/bluez/example/service'

    def __init__(self, bus, index, uuid):
        self.path = self.PATH_BASE + str(index)
        self.bus = bus
        self.uuid = uuid
        self.characteristics = []
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def add_characteristic(self, char):
        self.characteristics.append(char)

    def get_properties(self):
        return {
            'org.bluez.GattService1': {
                'UUID': self.uuid,
                'Primary': True,
                'Characteristics': dbus.Array(
                    [c.get_path() for c in self.characteristics],
                    signature='o')
            }
        }

class Characteristic(dbus.service.Object):
    def __init__(self, bus, index, uuid, flags, service):
        self.path = service.path + '/char' + str(index)
        self.bus = bus
        self.uuid = uuid
        self.flags = flags
        self.service = service
        dbus.service.Object.__init__(self, bus, self.path)

    def get_path(self):
        return dbus.ObjectPath(self.path)

    def get_properties(self):
        return {
            'org.bluez.GattCharacteristic1': {
                'UUID': self.uuid,
                'Service': self.service.get_path(),
                'Flags': dbus.Array(self.flags, signature='s'),
            }
        }

class ZipWriterCharacteristic(Characteristic):
    def __init__(self, bus, index, service):
        super().__init__(bus, index, CHAR_UUID, ['write'], service)
        self.value = bytearray()

    @dbus.service.method('org.bluez.GattCharacteristic1',
                         in_signature='aya{sv}', out_signature='')
    def WriteValue(self, value, options):
        print(f"[+] Received {len(value)} bytes")
        self.value += bytes(value)
        os.makedirs(os.path.dirname(ZIP_OUTPUT_PATH), exist_ok=True)
        with open(ZIP_OUTPUT_PATH, 'wb') as f:
            f.write(self.value)
        print(f"[+] ZIP saved to {ZIP_OUTPUT_PATH}")

def register_app_cb():
    print("[*] test-gatt-server: GATT application registered")

def register_app_error_cb(error):
    print(f"[!] test-gatt-server: Failed to register application: {error}")
    mainloop.quit()

def main():
    global mainloop
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()

    adapter_props = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, ADAPTER_PATH),
                                   'org.freedesktop.DBus.Properties')
    adapter_props.Set('org.bluez.Adapter1', 'Powered', dbus.Boolean(1))

    app = Application(bus)

    svc = Service(bus, 0, SERVICE_UUID)
    char = ZipWriterCharacteristic(bus, 0, svc)
    svc.add_characteristic(char)
    app.add_service(svc)

    service_manager = dbus.Interface(bus.get_object(BLUEZ_SERVICE_NAME, ADAPTER_PATH),
                                     GATT_MANAGER_IFACE)

    service_manager.RegisterApplication(app.get_path(), {},
                                        reply_handler=register_app_cb,
                                        error_handler=register_app_error_cb)

    mainloop = GLib.MainLoop()
    mainloop.run()

if __name__ == '__main__':
    main()
