#!/bin/bash

mkdir appli/log
mkdir wireless/tu/log
mkdir wireless/monitoring/log

curl -s https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | sudo sudo os=debian dist=bookworm bash
sudo apt-get install speedtest