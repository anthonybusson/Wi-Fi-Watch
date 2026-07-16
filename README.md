[Pour voir la documentation](DOCUMENTATION.md)

# Installation - Ghost Station Monitoring

Ce document explique comment installer le projet complet :

- `/server/webapp/` (interface web + API Flask + orchestration Ansible)
- `/client/` (scripts de mesure deployes sur les sondes)

## 1. Prerequis

### Serveur de supervision

- Linux (Debian/Ubuntu recommande)
- Docker + Docker Compose plugin
- Ansible (pour le deploiement initial des sondes)
- Acces SSH vers les sondes
- Serveur syslog local actif (rsyslog recommande), avec socket `/dev/log` disponible

### Sondes (machines clientes)

- Debian fortement recommande
- Interface Wi-Fi disponible
- Acces SSH autorise depuis le serveur
- Disposer d'un utilisateur linux sur la sonde qui a la possibilité de passer root
- Adresse IP de la sonde
- Lien filaire entre le serveur de supervision et la sonde

<img src="topologie.png" alt="alt text" width="400"/>

## 2. Recuperer le projet

```bash
git clone <url-du-repo>
cd wirelessmonitoring
```

## 3. Configurer Ansible (inventaire + cle SSH)

Modifier le fichier :

- `/server/webapp/ansible-client/inventory/inventory.yml`

Choisir le nom pour la sonde (ici, raspberry) et spécifier la bonne adresse IP

Exemple minimal:

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
```

Pour ajouter plusieurs sondes, ajouter un nouveau bloc correspondant à la nouvelle sonde avec la bonne adresse IP :

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

Modifier le fichier `creds.csv` situé dans `/client/wireless/configuration/files/` :

- **Pour les points d'accès nécessitant une authentification WPA2 Enterprise :**
  Ajoutez la ligne suivante à votre fichier. 
  
  * **SSID** : Spécifiez le nom complet du réseau (respectez la casse et les espaces, ex. : *MonSSID 1*).
  * **Username / Password** : Vérifiez que vos identifiants sont corrects.

  ```text
  SSID,WPA-EAP,Username,Password 
  ```

- **Pour les points d'accès nécessitant une authentification WPA2-PSK (clé pré-partagée) :**
  Ajoutez la ligne suivante à votre fichier.
  
  * **SSID** : Spécifiez le nom complet du réseau (respectez la casse et les espaces, ex. : *MonSSID 1*).
  * **PSK** : Vérifiez que la clé pré-partagée est correcte.

  ```text
  SSID,WPA-PSK,PSK
  ```

Depuis le dossier server/webapp, générer ensuite la clé ssh à placer sur la sonde :

```bash
mkdir ansible-client/keys
ssh-keygen -t rsa -b 4096 -f ansible-client/keys/id_rsa_ansible -N "" -C "ansible-monitoring"
```

Modifier les droits de la cle privee:

```bash
chmod 600 ansible-client/keys/id_rsa_ansible
```

Pour savoir si la carte réseau de la sonde fournie le taux d'occupation du canal, après avoir connecté la sonde à un point d'accès, entrer la commande suivante sur la sonde : `sudo iw dev <Nom de l'interface> survey dump`

  - si la sortie est similaire à celle-ci, alors la carte réseau supporte la mesure : 

    ```
    Survey data from wlan0
        frequency:                      5180 MHz
        channel active time:            490343 ms
        channel busy time:              3790 ms
        channel receive time:           1743 ms
        channel transmit time:          1427 ms

Se rendre alors dans le fichier `/client/wireless/monitoring/get_infos` :

Plusieurs cas sont possibles :
  - Cas n°1 : Les valeurs ne se mettent à jour que pour une seule fréquence. Vous devez alors modifier toutes les occurences `in use` par le fréquence correspondante (`5180` dans l'exemple précédent).

  - Cas n°2 : Dans l'exemple suivant, l'occurence `in use` est dans la sortie de la commande. Vous n'avez rien à modifier dans le code et vous pouvez passer aux étapes suivantes.

    ```
    Survey data from wlp5s0
          frequency:                      5220 MHz [in use]
          noise:                          -101 dBm
          channel active time:            6078 ms
          channel busy time:              437 ms
          channel receive time:           52 ms
          channel transmit time:          11 ms

  - Cas n°3 : Aucune sortie n'est disponible. La carte réseau de votre sonde ne fournit pas le le taux d'occupation du canal. Vous n'avez rien à modifier dans le code et vous pouvez passer aux étapes suivantes.


## 4. Deployer le client sur les sondes en utilisant l'utilisateur ayant les droits sudo déjà présent sur la sonde

Installer le paquet `sshpass` : `sudo apt install sshpass`

Installer aussi les autres paquets : `sudo bash install.sh`

Depuis `/server/webapp`:

```bash
ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i ansible-client/inventory/inventory.yml deploy-client-configuration.yml -e ansible_user="<utilisateur à spécifier>" -e "ansible_ssh_private_key_file=None" -k -K --limit <Nom de la sonde dans l'inventaire Ansible>
```

Attention à bien modifier la ligne de commande 

Réiterer sur chacune des sondes en veillant à modifier les paramètres de la commande à chaque fois

Ce playbook:

- cree l'utilisateur `monitoring`
- copie le dossier `/client/` vers `/opt/client/` sur la/les sonde(s)
- installe les paquets necessaires (iperf3, wireless-tools, dnsutils, curl, wpasupplicant, dhclient)
- installe `speedtest` via `/client/install.sh`
- deploie un hook DHCP (`wifi-route`)
- desactive `NetworkManager` sur la sonde


## 5. Lancer le conteneur pour le serveur web

Depuis `/server/webapp`:

```bash
sudo bash install.sh
sudo docker compose up --build -d
```

Verification:

```bash
sudo docker compose ps
sudo docker compose logs -f wifi-monitoring
```

L'application est disponible sur:

- `http://localhost:8000`
- `http://<ip-du-serveur>:8000`

## 6. Utilisation et vérification

1. Ouvrir l'interface web sur `http://<ip-du-serveur>:8000`
2. Vérifier que la sonde apparaît dans la liste des probes
3. Dans l'onglet Credentials, il est possible de déployer un fichier CSV contenant les identifiants de connexion aux points d'accès 
4. Dans l'onglet Visualization, lancer un scan BSSID puis un test (association/authentification, DHCP, monitoring)
5. Dans l'onglet SysLog, lancer une suite de tests sur chacun des BSSIDs du SSID spécifié
6. Pour lancer les tests en continu, se rendre sur la page de SysLog, choisir les paramètres souhaités et sauvegarder la configuration. Depuis la machine hébergeant le conteneur, lancer la commande : `curl -s "http://127.0.0.1:8000/events?host=<Nom_de_la_sonde>&interface=<Nom_de_l'interface_sur_la_sonde>" > /dev/null 2>&1 &`
7. Pour vérifier la journalisation : `journalctl -f -t WifiMonitoring`
8. Pour effectuer un test de débit instantané, préférer le test de débit via iperf3. Mettre en place le serveur iperf3 sur le meme sous réseau que la sonde.
9. Pour arrêter le conteneur, lancer : `sudo docker compose down`