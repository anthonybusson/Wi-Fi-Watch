from flask import Flask, request, jsonify, send_from_directory, Response
import subprocess
import json, yaml
import time, select
import os, signal
import logging
from logging.handlers import SysLogHandler
import queue, threading

#ansible
import ansible_runner

logger = logging.getLogger('WifiMonitoring')
logger.setLevel(logging.DEBUG)

try:
    syslog_handler = SysLogHandler(address='/dev/log', facility=SysLogHandler.LOG_LOCAL1)
except FileNotFoundError:
    syslog_handler = logging.StreamHandler()

formatter = logging.Formatter('%(name)s: [%(levelname)s] %(message)s')
syslog_handler.setFormatter(formatter)
logger.addHandler(syslog_handler)


def envoyer_log(data):
    if not isinstance(data, dict):
        return
        
    service = data.get('service') # on récupère le service pour générer le bon log
    status = int(data.get('status', -1)) # selon le status, on chosit la sévérité
    message = f"[{service}]"
    
    match service: # selon, le service, on récupère chacune des valeurs des tests et on spécifie les valeurs dans les logs
        case "LOG":
            return
   
        case "BW_SPDT":
            if status == 0:
                dl = data.get('DL')
                ul = data.get('UL')
                dlmiq = data.get('DLMIQ')
                ulmiq = data.get('ULMIQ')
                message += f" | Download : {dl} Mbps | Upload : {ul} Mbps | Average Download Latency : {dlmiq} ms | Average Upload Latency : {ulmiq} ms"
                logger.info(f"{message} - SUCCESS")
            else:
                logger.error(f"{message} - Throughput test FAILED")

        case "BW_IPERF":
            if status == 0:
                dl = data.get('DL')
                ul = data.get('UL')
                jit = data.get('JIT')
                pl = data.get('PL')
                message += f" | Download : {dl} Mbps | Upload : {ul} Mbps | Jitter : {jit} ms | Packet Loss : {pl} %"
                logger.info(f"{message} - SUCCESS")
            else:
                logger.error(f"{message} - Throughput test FAILED")

        case "IPConfig":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']}  "

            if status == 0:
                ip = data.get('address')
                gw = data.get('gateway')
                mask = data.get('subnet_mask')
                message += f" | IP : {ip}/{mask} | Gateway: {gw}"
                logger.info(f"{message} - SUCCESS")
            else:
                logger.error(f"{message} - IP Configuration unavailable")

        case "ASAU":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']}  "

            duration = data.get('duration', 'Unavailable duration')
            message += f" | Duration: {duration} s"
            
            if status == 0:
                logger.info(f"{message} - SUCCESS")
            elif status == 1:
                logger.warning(f"{message} - MODERATE PERFORMANCE (4s-8s)")
            elif status == 2:
                logger.warning(f"{message} - BAD PERFORMANCE (8s-15s)")
            elif status == 3:
                logger.warning(f"{message} - EXTREMELY BAD PERFORMANCE (<15s)")
            else:
                logger.error(f"{message} - ASSOCIATION/AUTHENTICATION FAILED")

        case "BSSID_ASAU":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']}  "

            duration = data.get('duration', 'Unavailable duration')
            message += f" | Duration: {duration} s"

            if status == 0:
                logger.info(f"{message} - SUCCESS")
            elif status == 1:
                logger.warning(f"{message} - MODERATE PERFORMANCE (4s-8s)")
            elif status == 2:
                logger.warning(f"{message} - QUITE BAD PERFORMANCE (8s-15s)")
            elif status == 3:
                logger.warning(f"{message} - EXTREMELY BAD PERFORMANCE (<15s)")
            else:
                logger.error(f"{message} - ASSOCIATION/AUTHENTICATION FAILED")
 
        case "DHCP":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']}  "

            if status == 0:
                duration = data.get('duration', 'Unavailable duration')
                message += f" | Duration: {duration} s"
                logger.info(f"{message} - SUCCESS")
            else:
                logger.error(f"{message} - DHCP Request failed")

        case "ICMP":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']}  "

            duration = data.get('duration', 'Unavailable duration')
            average_latency = data.get('AVGL')
            min_latency = data.get('MINL')
            max_latency = data.get('MAXL')
            pl = data.get('RECV')
            message += f" Average latency: {average_latency} ms | Minimum latency: {min_latency} ms | Maximum latency: {max_latency} ms | Packet Received: {pl}"
            if status == 0:
                logger.info(f"{message} - SUCCESS")
            else:
                logger.error(f"{message} - DHCP Request failed")

        case "DNS":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']}  "

            if status == 0:
                duration = data.get('duration', 'Unavailable duration')
                message += f" | Duration: {duration} s"
                logger.info(f"{message} - SUCCESS")
            else:
                logger.error(f"{message} - DNS Resolution failed")

        case "HTTP":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']}  "

            if status == 0:
                duration = data.get('duration', 'Unavailable duration')
                message += f" | Duration: {duration} s"
                logger.info(f"{message} - SUCCESS")
            else:
                logger.error(f"{message} - DNS Resolution failed")

        case "WirelessInfo":
            if 'bssid' in data:
                message += f"| BSSID: {data['bssid']} "

            reception_mcs=data.get('MCSR')
            transmission_mcs=data.get('MCSE')
            bt=data.get('BT')
            rssi=data.get('RSSI')

            message += f" Reception MCS : {reception_mcs} Mbps | Transmission MCS : {transmission_mcs} Mbps | Busy Time : {bt} % | RSSI : {rssi} dBm"
            logger.info(f"{message}")
        



app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")


@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/favicon.ico")
def favicon():
    return send_from_directory(".", "favicon.ico")    

@app.route("/script/script.js")
def js():
    return send_from_directory("./script", "script.js")

@app.route("/script/alpine.js")
def alpine():
    return send_from_directory("./script", "alpine.js")

@app.route("/script/chart.js")
def chart():
    return send_from_directory("./script", "chart.js")

@app.route("/style.css")
def css():
    return send_from_directory(".", "style.css")

@app.route("/hosts") # permet de récupérer, depuis l'inventaire ansible, la liste des sondes
def get_hosts():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    inventory_file = os.path.join(ansible_dir, 'inventory', 'inventory.yml')
    try:
        with open(inventory_file, 'r') as f:
            data = yaml.safe_load(f)
            print(data)
            hosts = list(data.get('all', {}).get('children', {}).get('sondes', {}).get('hosts', {}).keys())
            return jsonify(hosts) # on retourne la liste des sondes disponibles vers le client
    except Exception:
        return jsonify([]), 500

@app.route("/hosts/interfaces")
def get_hosts_interfaces():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    inventory_file = os.path.join(ansible_dir, 'inventory', 'inventory.yml')
    

    r = ansible_runner.run( # pour chaucune des sondes spécifiées dans l'inventaire, on lance le playbook qui récupère la liste des interfaces sans fil
        private_data_dir=ansible_dir,
        playbook='get-interfaces.yml',
        inventory='inventory.yml',
        limit='all',
        quiet=False
    )

    results = {}

    for event in r.events:
        if event['event'] == 'runner_on_ok':
                host = event['event_data']['host']
                task_name = event['event_data']['task']
                if task_name == "Script execution":
                    sortie_ansible = event['event_data']['res'].get('stdout', '{}') 
                    try:
                        print(sortie_ansible)
                        parsed_json = json.loads(sortie_ansible)
                        results[host] = parsed_json.get('interfaces', [])# on ajoute au tableau, pour chaque sonde, la liste de ses interfaces sans fil

                    except json.JSONDecodeError:
                        results[host] = ["ERROR_PARSING_JSON"]

                elif event['event'] == 'runner_on_unreachable':
                    host = event['event_data']['host']
                    results[host] = ["UNREACHABLE"]

    return jsonify(results)

@app.route("/wifi/status", methods=["GET"]) # permet de connaitre l'état (associé ou non) de l'interface choisie pour la sonde choisie
def get_wireless_status():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    inventory_file = os.path.join(ansible_dir, 'inventory', 'inventory.yml')

    sonde = request.args.get("host", "sonde")
    interface = request.args.get("interface")
    bssid = request.args.get("bssid")

    arguments = { "interface" : interface, "bssid" : bssid }

    r = ansible_runner.run( # on lance la playbook qui lance le script sur la sonde
        private_data_dir=ansible_dir,
        playbook='wireless-status-playbook.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    results = []

    for event in r.events:
        if event['event'] == 'runner_on_ok':
            if event['event_data']['task'] == 'Script execution':
                sortie_ansible = event['event_data']['res']['stdout']
                try:
                    results = json.loads(sortie_ansible)
                except json.JSONDecodeError:
                    return jsonify({"error": "Invalid data format received from the probe"}), 500
    
    return jsonify({
        "results": results
    })

@app.route("/scan", methods=["POST"])
def scan():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')

    data = request.json
    signal = data.get("signal") # on récupère le signal minimal spécifié sur l'interface web,
    sonde = data.get("host", "sonde") # la sonde,
    interface = data.get("interface") # ainsi que l'interface

    if signal is None:
        return jsonify({"error": "Paramètre 'signal' manquant"}), 400 #si pas de signal, l'erreur est renvoyé vers le client

    arguments = { "signal_min": str(signal), "interface" : interface }

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='scan-playbook.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    if r.status == 'failed':
        return jsonify({"error": "Scan failed on the probe"}), 500 # si le playbook ansible renvoit une erreur, l'erreur est renvoyé vers le client

    results = []
    
    for event in r.events:
        if event['event'] == 'runner_on_ok':
            if event['event_data']['task'] == 'Script execution':
                sortie_ansible = event['event_data']['res']['stdout']
                try:
                    results = json.loads(sortie_ansible)
                    envoyer_log(results)
                except json.JSONDecodeError:
                    return jsonify({"error": "Invalid data format received from the probe"}), 500

    return jsonify({
        "signal_min": signal,
        "results": results
    })

@app.route("/bssid/configuration", methods=["POST"])
def send_bssid():

    data = request.json
    bssid = data.get('bssid')
    ssid = data.get('ssid')
    sonde = data.get("host", "sonde")
    
    if not bssid or not ssid:
        return jsonify({"error": "BSSID or SSID is missing"}), 400

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    
    arguments = { "ssid": ssid , "bssid": bssid}

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='create-configuration-playbook.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    if r.status == 'failed':
        return jsonify({"error": "Failed to create a configuration"}), 500

    return jsonify({"status": "Configuration created successfully"})

@app.route("/bssid/configuration/send", methods=["POST"])
def send_wpa_configuration():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    sonde = request.form.get("host", "sonde")

    if 'creds' not in request.files:
        return jsonify({"error": "Any file was upload"}), 400
    
    file = request.files['creds']
    
    if file.filename == '':
        return jsonify({"error": "Name file is empty"}), 400

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    file.save(file_path)


    configuration_file_path = { "configuration_file_path" : os.path.abspath(file_path)}

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='push-wpa-configuration.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=configuration_file_path,
        quiet=False
    )

    if r.status == 'failed':
        return jsonify({"error": "Failed to deploy configuration", "code": 500}), 500

    return jsonify({"status": "Configuration deployed successfully", "code": 200}), 200

@app.route("/bssid/events")
def bssid_assoAuth():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    sonde = request.args.get('host', 'sonde')
    interface = request.args.get("interface")

    arguments = { "interface" : interface }

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='association-authentication-playbook.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    if r.status == 'failed':
        return jsonify({"error": "Association/authentication failed'"}), 500
    
    results = []

    for event in r.events:
        if event['event'] == 'runner_on_ok':
            if event['event_data']['task'] == 'Script execution':
                sortie_ansible = event['event_data']['res']['stdout']
                try:
                    results = json.loads(sortie_ansible)
                    envoyer_log(results)
                except json.JSONDecodeError:
                    return jsonify({"error": "Invalid data format received from the probe"}), 500
    
    return jsonify({
        "results": results
    })

@app.route("/ip/events", methods=["GET"])
def ip_events():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    sonde = request.args.get('host', 'sonde')
    interface = request.args.get("interface")

    arguments = { "interface" : interface }

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='dhcp-ip-configuration.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    if r.status == 'failed':
        return jsonify({"error": "Network request configuration failed'"}), 500
    
    results = []
    task_list = ['DHCP script execution', 'IP script execution']

    for event in r.events:
        if event['event'] == 'runner_on_ok':
            task_name = event['event_data'].get('task')

            if task_name in task_list:
                try:
                    sortie_ansible = event['event_data']['res']['stdout']
                    
                    try:
                        sortie_json = json.loads(sortie_ansible)
                    except json.JSONDecodeError:
                        sortie_json = {
                            "task": task_name,
                            "raw_output": sortie_ansible,
                            "info": "La sortie n'était pas au format JSON valide"
                        }

                    
                    results.append(sortie_json)
                    envoyer_log(sortie_json)

                except KeyError:
                    continue

    return jsonify({
        "results": results
    })

@app.route("/wifi/monitor/start")
def start_wifi_monitor():

    intervalle = request.args.get('interval', '2')
    sonde = request.args.get('host', 'sonde')
    interface = request.args.get("interface")

    print(intervalle, sonde, interface)

    if not intervalle.isdigit():
        intervalle = '2'

    def stream():
        ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
        inventory_file = os.path.join(ansible_dir, 'inventory' , 'inventory.yml')

        with open(inventory_file, 'r') as f:
            data = yaml.safe_load(f)

        try:
            group_data = data['all']['children']['sondes']
            hosts_dict = group_data.get('hosts', {})
            group_vars = group_data.get('vars', {})

            if sonde not in hosts_dict:
                 yield f"data: {json.dumps({'service':'LOG','message':f'Host {sonde} not found'})}\n\n"
                 return

            host_vars = hosts_dict[sonde]
            ip = host_vars.get('ansible_host')
            user = host_vars.get('ansible_user', group_vars.get('ansible_user'))
            user = group_vars.get(user.replace("{", "").replace("}", "").strip(), user)
            key_file = host_vars.get('ansible_ssh_private_key_file', group_vars.get('ansible_ssh_private_key_file'))
            cle = os.path.abspath(os.path.join(ansible_dir, key_file))

            print(host_vars, ip, user, cle)
        except Exception as e:
             yield f"data: {json.dumps({'service':'LOG','message':f'Inventory Error: {str(e)}'})}\n\n"
             return

        cmd = [
            "ssh", "-tt",
            "-o", "StrictHostKeyChecking=no",
            "-i", cle,                  
            f"{user}@{ip}",                  
            f"sudo /opt/client/wireless/monitoring/get_infos -i {intervalle} -I {interface}"
        ]

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )

        
        while True:
            line = process.stdout.readline()
            if not line:
                break

            line = line.strip()
            print(line)
            try:
                print(data)
                data = json.loads(line)
                envoyer_log(data)
                
                yield f"data: {json.dumps(data)}\n\n"
            except json.JSONDecodeError:
                yield f"data: {json.dumps({'service':'LOG','message':line})}\n\n"

        yield "event: end\ndata: done\n\n"

    return app.response_class(
        stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )



@app.route("/wifi/monitor/stop", methods=["POST"])
def stop_wifi_monitor():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    data = request.json
    sonde = data.get("host", "sonde")
    interface = data.get("interface")

    arguments = { "interface" : interface }

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='stop-wifi-monitor-playbook.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    results = {}

    for event in r.events:
        if event.get('event') == 'runner_on_ok':
            event_data = event.get('event_data', {})
            if event_data.get('task') == 'Script execution':
                res = event_data.get('res', {})
                sortie_ansible = res.get('stdout', '').strip()
                if sortie_ansible:
                    try:
                        results = json.loads(sortie_ansible)
                        envoyer_log(results)
                    except json.JSONDecodeError:
                        print(f"Parsing error JSON. output : {sortie_ansible}")
                        results = {
                            "error": "Ansible output is not a valid JSON", 
                            "raw_output": sortie_ansible
                        }
                else:
                    results = {"error": "Empty output"}
    if r.status == 'failed':
        return jsonify({
            "error": "Fail", 
            "details": results
        }), 500

    return jsonify({
        "results": results
    }), 200


@app.route("/speedtest", methods=["POST"])
def speedtest():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    data = request.json
    sonde = data.get("host", "sonde")
    interface = data.get("interface")
    param = data.get("bwp", {})

    bandwidth_test_type = param.get("type", "speedtest")
    target = param.get("target", "8.8.8.8")
    

    print(bandwidth_test_type)
    print(target)

    arguments = {
        "type": bandwidth_test_type,
        "interface" : interface
    }

    if bandwidth_test_type == "iperf3":
        target = param.get("target")
        
        if not target:
            return jsonify({"code": 400, "status": "Error: iperf3 target IP is missing"}), 400
             
    if target:
        arguments["target"] = target
    
    

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='wireless-speedtest.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    results = []
    
    for event in r.events:
        if event['event'] == 'runner_on_ok':
            if event['event_data']['task'] == 'Script execution':
                sortie_ansible = event['event_data']['res']['stdout']
                try:
                    results = json.loads(sortie_ansible)
                    envoyer_log(results)
                except json.JSONDecodeError:
                    results = {"status": "failure", "raw_output": sortie_ansible}

    if r.status == 'failed':
         return jsonify({"error": "Ansible execution failed", "details": results}), 500

    return jsonify({
        "results": results
    })

@app.route("/autorun", methods=["POST"])
def autorun():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    data = request.json
    sonde = data.get("host", "sonde")
    
    config = {
        "interval": data.get('interval', 10),
        "signal_min": data.get('signal_min', -70),
        "tx_power": data.get('tx_power', 23),
        "dns": '1' if data.get('dns') else '0',
        "dns_target": data.get('dns_target', ''),
        "http": '1' if data.get('http') else '0',
        "http_target": data.get('http_target', ''),
        "ping": '1' if data.get('ping') else '0',
        "nb_ping": data.get('nb_ping', 4),
        "ping_target": data.get('ping_target', ''),
        "ssid_autorun": data.get('ssid_autorun', ''),
        "interface": data.get("interface")
    }

    try:
        r = ansible_runner.run(
            private_data_dir=ansible_dir,
            playbook='push-autorun-configuration.yml',
            inventory='inventory.yml', 
            limit=sonde,
            extravars=config,
            quiet=False
        )

        if r.status == 'failed':
            return jsonify({"status": "error", "message": "Failed to deploy configuration"}), 500

        return jsonify({"status": "success", "message": "Configuration deployed successfully"})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/events")
def events():
    sonde = request.args.get('host', 'sonde')

    print("events")

    def stream():
        ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
        inventory_file = os.path.join(ansible_dir, 'inventory' , 'inventory.yml')
        

        with open(inventory_file, 'r') as f:
            data = yaml.safe_load(f)


        try:
            group_data = data['all']['children']['sondes']
            hosts_dict = group_data.get('hosts', {})
            group_vars = group_data.get('vars', {})

            if sonde not in hosts_dict:
                 yield f"data: {json.dumps({'service':'LOG','message':f'Host {sonde} not found'})}\n\n"
                 return

            host_vars = hosts_dict[sonde]
            ip = host_vars.get('ansible_host')
            user = host_vars.get('ansible_user', group_vars.get('ansible_user'))
            user = group_vars.get(user.replace("{", "").replace("}", "").strip(), user)
            key_file = host_vars.get('ansible_ssh_private_key_file', group_vars.get('ansible_ssh_private_key_file'))
            cle = os.path.abspath(os.path.join(ansible_dir, key_file))

            print(host_vars, ip, user, key_file, cle)

        except Exception as e:
             yield f"data: {json.dumps({'service':'LOG','message':f'Inventory Error: {str(e)}'})}\n\n"
             return

        cmd = [
            "ssh", "-tt", "-o", "StrictHostKeyChecking=no", "-i", cle,
            f"{user}@{ip}",
            f"sudo /opt/client/autorun -c /opt/client/config.cfg"
        ]

        print(cmd)

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        
        while True:
            line = process.stdout.readline()
            if not line:
                break

            line = line.strip()
            print(line)
            try:
                data = json.loads(line)
                envoyer_log(data)
                
                yield f"data: {json.dumps(data)}\n\n"
            except json.JSONDecodeError:
                yield f"data: {json.dumps({'service':'LOG','message':line})}\n\n"

        yield "event: end\ndata: done\n\n"

    return app.response_class(
        stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

@app.route("/reset", methods=["POST"])
def reset():
    ansible_dir = os.path.join(BASE_DIR, 'ansible-client')
    data = request.json
    sonde = data.get("host", "sonde")
    interface = data.get("interface")

    arguments = { "interface" : interface }

    r = ansible_runner.run(
        private_data_dir=ansible_dir,
        playbook='reset-configuration.yml',
        inventory='inventory.yml',
        limit=sonde,
        extravars=arguments,
        quiet=False
    )

    return jsonify({"reset": "Remise à 0"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
