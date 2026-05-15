#!/bin/bash
set -e

echo "Installing Raspberry Pi Water + DHT11 client dependencies..."

sudo apt update
sudo apt install -y python3-pip i2c-tools libgpiod2

pip3 install --break-system-packages requests smbus2 adafruit-circuitpython-dht

echo ""
echo "Done."
echo "Check water sensor: i2cdetect -y 1"
echo "Run client: python3 water_client.py"
