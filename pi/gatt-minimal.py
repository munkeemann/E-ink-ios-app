# gatt-minimal.py
import asyncio
from dbus_next import BusType
from dbus_next.aio import MessageBus
from dbus_next.service import ServiceInterface, dbus_property, PropertyAccess

class TestApp(ServiceInterface):
    def __init__(self, path):
        super().__init__('org.freedesktop.DBus.ObjectManager')
        self.path = path

    async def get_managed_objects(self):
        return {}

class TestService(ServiceInterface):
    def __init__(self, path):
        super().__init__('org.bluez.GattService1')
        self.path = path

    @dbus_property(PropertyAccess.READ)
    def UUID(self) -> 's':
        return '12345678-1234-5678-1234-56789abcdef0'

    @dbus_property(PropertyAccess.READ)
    def Primary(self) -> 'b':
        return True

class TestCharacteristic(ServiceInterface):
    def __init__(self, path):
        super().__init__('org.bluez.GattCharacteristic1')
        self.path = path

    @dbus_property(PropertyAccess.READ)
    def UUID(self) -> 's':
        return 'abcdef01-1234-5678-1234-56789abcdef0'

    @dbus_property(PropertyAccess.READ)
    def Service(self) -> 'o':
        return '/org/bluez/example/service0'

    @dbus_property(PropertyAccess.READ)
    def Flags(self) -> 'as':
        return ['read']

async def main():
    print("Connecting to system bus...")
    bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
    print("Connected.")

    print("Exporting application, service, and characteristic...")
    bus.export('/org/bluez/example', TestApp('/org/bluez/example'))
    bus.export('/org/bluez/example/service0', TestService('/org/bluez/example/service0'))
    bus.export('/org/bluez/example/service0/char0', TestCharacteristic('/org/bluez/example/service0/char0'))

    print("Getting GattManager1...")
    introspect = await bus.introspect('org.bluez', '/org/bluez/hci0')
    proxy = bus.get_proxy_object('org.bluez', '/org/bluez/hci0', introspect)
    gatt = proxy.get_interface('org.bluez.GattManager1')

    print("Calling RegisterApplication...")
    try:
        await gatt.call_register_application('/org/bluez/example', {})
        print("✅ GATT registered.")
    except Exception as e:
        print("❌ GATT registration failed:", e)

    await asyncio.get_event_loop().create_future()

asyncio.run(main())
