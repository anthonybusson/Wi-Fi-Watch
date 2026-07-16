[To see the documentation](DOCUMENTATION.md)

# Installation - Wi-Fi Watch 

This document explains how to install the complete project:
- `/server/webapp/` (web interface + Flask API + Ansible orchestration)
- `/client/` (measurement scripts deployed on monitoring probes)

## 1. Prerequisites

### Monitoring Server

- Linux (Debian/Ubuntu recommended)
- Docker + Docker Compose plugin
- Ansible (for the initial deployment of monitoring probes)
- SSH access to monitoring probes
- Active local syslog server (rsyslog recommended), with `/dev/log` socket available

### Probes (Client Machines)

- Debian strongly recommended
- Available Wi-Fi interface
- SSH access authorized from the server
- A Linux user on the probe with the ability to become root
- IP address of the probe
- Wired connection between the monitoring server and the probe

<img src="topologie.png" alt="alt text" width="400"/>

## 2. Retrieve the Project

```bash
git clone <repository-url>
cd wirelessmonitoring
```
## 3. Configure Ansible (Inventory + SSH Key)

Modify the following file:

```bash
/server/webapp/ansible-client/inventory/inventory.yml
```

Choose the probe name (here, raspberry) and specify the correct IP address.

Minimal example:
```yaml
all:
  children:
    probes:
      vars:
        monitoring_user: "monitoring"
        ansible_ssh_public_key_file: "./keys/id_rsa_ansible.pub"
        ansible_ssh_private_key_file: "./keys/id_rsa_ansible"
      hosts:
        raspberry:
          ansible_host: X.X.X.X
          ansible_user: "{{ monitoring_user }}"
```
To add multiple probes, add a new block corresponding to the new probe with the correct IP address:
```yaml
all:
  children:
    sondes:
      vars:
        monitoring_user: "monitoring"
        ansible_ssh_public_key_file: "./keys/id_rsa_ansible.pub"
        ansible_ssh_private_key_file: "./keys/id_rsa_ansible"
      hosts:
        raspberry:
          ansible_host: X.X.X.X
          ansible_user: "{{ monitoring_user }}"
        NomNouvelleSonde:
          ansible_host: X.X.X.X
          ansible_user: "{{ monitoring_user }}"
```
Modify the file `creds.csv` located in `/client/wireless/configuration/files/` :

- **For access points requiring WPA2 Enterprise authentication:**
  Add the following line to your file. 
  
  * **SSID** : Specify the complete network name (respect capitalization and spaces, e.g.: MySSID 1).
  * **Username / Password** : Check that your credentials are correct.
  ```text
  SSID,WPA-EAP,Username,Password 
  ```

- **For access points requiring WPA2-PSK authentication (pre-shared key):**
  Add the following line to your file.
  
  * **SSID** : Specify the complete network name (respect capitalization and spaces, e.g.: MySSID 1).
  * **PSK** : Check that the pre-shared key is correct.

  ```text
  SSID,WPA-PSK,PSK
  ```

 From the server/webapp directory, generate the SSH key to be installed on the monitoring node:

```bash
mkdir ansible-client/keys
ssh-keygen -t rsa -b 4096 -f ansible-client/keys/id_rsa_ansible -N "" -C "ansible-monitoring"
```

Modify the permissions of the private key:

```bash
chmod 600 ansible-client/keys/id_rsa_ansible
```

To determine whether the probe network card provides the channel occupancy rate, after connecting the probe to an access point, run the following command on the monitoring node: `sudo iw dev <Nom de l'interface> survey dump`

  - If the output is similar to the following, then the network card supports the measurement: 

    ```
    Survey data from wlan0
        frequency:                      5180 MHz
        channel active time:            490343 ms
        channel busy time:              3790 ms
        channel receive time:           1743 ms
        channel transmit time:          1427 ms

Go to the following file: `/client/wireless/monitoring/get_infos` :

Several cases are possible:
  - Case 1: Values are updated only for one frequency. You must then replace all occurrences of `in use` with the corresponding frequency (`5180` in the previous example).

  - Case 2: In the following example, the `in use` occurrence is present in the command output. No modification is required in the code and you can proceed to the next steps.

    ```
    Survey data from wlp5s0
          frequency:                      5220 MHz [in use]
          noise:                          -101 dBm
          channel active time:            6078 ms
          channel busy time:              437 ms
          channel receive time:           52 ms
          channel transmit time:          11 ms

  - Case 3: No output is available. The network card of your probe does not provide the channel occupancy rate. No modification is required in the code and you can proceed to the next steps.

## 4. Deploy the client on the probes using the existing user with sudo privileges on the monitoring node

Install the package `sshpass` : `sudo apt install sshpass`

Install the other packages : `sudo bash install.sh`

From `/server/webapp`:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i ansible-client/inventory/inventory.yml deploy-client-configuration.yml -e ansible_user="<username>" -e "ansible_ssh_private_key_file=None" -k -K --limit <monitoring node's name in the ansible inventory>
```

Make sure to modify the command line parameters accordingly.

Repeat the operation for each probe, ensuring that the command parameters are modified each time.

This playbook:

- create user `monitoring`
- copy the folder `/client/` to `/opt/client/` on the monitoring node(s)
- install the required packages (iperf3, wireless-tools, dnsutils, curl, wpasupplicant, dhclient)
- install `speedtest` via `/client/install.sh`
- deploy an DHCP hook (`wifi-route`)
- disable `NetworkManager` on the monitoring node


## 5. Start the container for the web server

From `/server/webapp`:

```bash
sudo bash install.sh
sudo docker compose up --build -d
```

Check:

```bash
sudo docker compose ps
sudo docker compose logs -f wifi-monitoring
```

The application is available at:

- `http://localhost:8000`
- `http://<ip-du-serveur>:8000`

## 6. Usage and verification

 http://<server-ip-address>:8000
Check that the probe appears in the list of probes
In the Credentials tab, it is possible to deploy a CSV file containing the access credentials for the access points
In the Visualization tab, launch a BSSID scan and then a test (association/authentication, DHCP, monitoring)
In the SysLog tab, launch a test sequence on each BSSID of the specified SSID
To launch continuous tests, go to the SysLog page, choose the desired parameters, and save the configuration. From the machine hosting the container, run the command:



1. Open the web interface at `http://<ip-du-serveur>:8000`
2. Check that the probe appears in the list of probes
3. In the Credentials tab, it is possible to deploy a CSV file containing the access credentials for the access points 
4. In the Visualization tab, launch a BSSID scan and then a test (association/authentication, DHCP, monitoring)
5. In the SysLog tab, launch a test sequence on each BSSID of the specified SSID
6. To launch continuous tests, go to the SysLog page, choose the desired parameters, and save the configuration. From the machine hosting the container, run the command: `curl -s "http://127.0.0.1:8000/events?host=<Nom_de_la_sonde>&interface=<Nom_de_l'interface_sur_la_sonde>" > /dev/null 2>&1 &`
7. To verify the logging: `journalctl -f -t WifiMonitoring`
8. To perform an instantaneous throughput test, prefer the throughput test using iperf3. Set up the iperf3 server on the same subnet as the monitoring node.
9. To stop the container, run: `sudo docker compose down`



