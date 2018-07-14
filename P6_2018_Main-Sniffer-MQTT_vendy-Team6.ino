// P6, Team 6, »vendy« , Jeannine Krämer, Sebastian Meidel, Uta Janzen, Raphael Herres, Marie Steinbrügge
// 2018 Marie Steinbrügge

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// BIBLIOTHEKEN

//Bibliotheken implementieren für MQTT und ESP (beinhalten spezifische Funktionen)
//extern "C" wird verwendet, um eine C-Bibliothek einzubinden 
extern "C" {
  #include <user_interface.h>
}

#include "FS.h"             // Bibliothek zur Nutzung des Filesystems (zum Speichern der zu sendenden Informationen)
#include <ESP8266WiFi.h>    // mit dieser Bibliothek kann der ESP mit einem WIFI-Netzwerk verbunden werden, sodass Daten gesendet und empfangen werden können 
#include <PubSubClient.h>   // Bibliothek bietet Client-Funktion zum einfachen Publizieren/Abonnieren von Nachrichten an einen Server, der MQTT unterstützt 

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// WLAN-SNIFFER (kalanda)

// definiert konstante Werte, bevor das Programm kompiliert wird 
// definierte Konstanten in Arduino belegen keinen Programmspeicherplatz auf dem Chip
#define DATA_LENGTH           112
#define TYPE_MANAGEMENT       0x00
#define TYPE_CONTROL          0x01
#define TYPE_DATA             0x02
#define SUBTYPE_PROBE_REQUEST 0x04

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// MQTT-STUFF 

// konstante Variablen für das verwendete Netzwerk des Servers eintragen!
// notwendig für eine funktionierende Verbindung!
const char* ssid = "Drei-Fragezeichen";                             // Name des Netzwerks
const char* password = "DieGeilsteWGFahrtFieberbrunn2018";          // Passwort des Netzwerks
const char* mqtt_server = "192.168.178.38";                         // IP-Adresse des Geräts, auf welchem der Mosquitto-Broker läuft 

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// SWITCH-TIME

// Variablen für das Switchen zwischen "zuhören" und "senden" 
int Waiting_Time = 15000;    // wie lange darf der ESP8266 den gesendeten "probe request" zuhören?
int lastMillis = 0;          // wie viele Millisekunden sind seit dem letzten Wechsel vergangen?
bool switch_state;           // darf der ESP zum Wechseln in den DeepSleep fallen?

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// MQTT-STUFF

bool WiFi_MQTT_connect;
bool WiFi_Sniffer_connect;

//Erstellt einen Client, der eine Verbindung zu einer bestimmten Internet-IP-Adresse und einem Port herstellen kann
WiFiClient espClient;

//Erzeugt eine Client-Instanz, welcher ermöglicht wird, mit dem Mosquitto-Broker zu kommunizieren
PubSubClient client(espClient);

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// FILESYSTEM

File f;                       // Erstellt ein neues Filesystem
bool filesystem_available;    // ist das Filesystem verfügbar? true-false
String Topic = "vendy";       // unter welcher Topic werden die empfangenen "probe request" abgespeichert?

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// WLAN-SNIFFER (kalanda)

struct RxControl {
 signed rssi:8; 
 unsigned rate:4;
 unsigned is_group:1;
 unsigned:1;
 unsigned sig_mode:2; 
 unsigned legacy_length:12; 
 unsigned damatch0:1;
 unsigned damatch1:1;
 unsigned bssidmatch0:1;
 unsigned bssidmatch1:1;
 unsigned MCS:7; 
 unsigned CWB:1; 
 unsigned HT_length:16;
 unsigned Smoothing:1;
 unsigned Not_Sounding:1;
 unsigned:1;
 unsigned Aggregation:1;
 unsigned STBC:2;
 unsigned FEC_CODING:1; 
 unsigned SGI:1;
 unsigned rxend_state:8;
 unsigned ampdu_cnt:8;
 unsigned channel:4; 
 unsigned:12;
};

struct SnifferPacket{
    struct RxControl rx_ctrl;
    uint8_t data[DATA_LENGTH];
    uint16_t cnt;
    uint16_t len;
};


// Callback für promiskuitiven Modus
static void ICACHE_FLASH_ATTR sniffer_callback(uint8_t *buffer, uint16_t length) {
  struct SnifferPacket *snifferPacket = (struct SnifferPacket*) buffer;
  showMetadata(snifferPacket);
}

static void printDataSpan(uint16_t start, uint16_t size, uint8_t* data) {
  for(uint16_t i = start; i < DATA_LENGTH && i < start+size; i++) {
    Serial.write(data[i]);
  }
}

static void getMAC(char *addr, uint8_t* data, uint16_t offset) {
  sprintf(addr, "%02x:%02x:%02x:%02x:%02x:%02x", data[offset+0], data[offset+1], data[offset+2], data[offset+3], data[offset+4], data[offset+5]);
}

#define CHANNEL_HOP_INTERVAL_MS   1000
static os_timer_t channelHop_timer;

// Callback für Channel Hoping
void channelHop()
{
  // hoping channels 1-14
  uint8 new_channel = wifi_get_channel() + 1;
  if (new_channel > 14)
    new_channel = 1;
  wifi_set_channel(new_channel);
}

#define DISABLE 0
#define ENABLE  1

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// SWITCH-MODE (Ivan Grokhotkov)

uint32_t calculateCRC32(const uint8_t *data, size_t length);    // CRC-Funktion zur Sicherstellung der Datengültigkeit, die gespeicherten Daten können zwischen dem DeepSleep Modus beibehalten werden

struct {                  // Struktur, die im RTC-Speicher abgelegt wird; erste Feld ist CRC32, das auf der Grundlage des restlichen Inhalts kalkuliert wird
  uint32_t crc32;
  byte data[508];         // in diesem Fall wird es als byte-Array gespeichert
} rtcData;

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



void setup() {
  // Stellt die Datenrate in Bits pro Sekunde für die serielle Datenübetragung ein
  Serial.begin(115200);
  delay(1000);

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// FILESYSTEM (Daniel Eichhorn)
 
 // Filesystem initialisieren
  SPIFFS.begin();

  // öffnet das Filesystem im Lese-Modus (am angegebenen Pfad) 
  f = SPIFFS.open("/MAC-Daten.txt", "r");  // r = read

  // falls das Öffnen des Filesystems im Lesemodus fehlgeschlagen ist, existiert dieses nicht und ....
  if (!f) {
    Serial.println("File doesn't exist yet. Creating it and start Sniffing!");  // ...eine Meldung hierzu wird ausgegeben
    
    //durch das Betätigen des Schreib-Modus, wird ein neues Filesystem erstellt 
    f = SPIFFS.open("/MAC-Daten.txt", "w");  // w = write
    filesystem_available = false;  // Feedback für Sniffer Modus, dass kein Filesystem vorhanden war
  }
  else{
    filesystem_available = true;  // wenn das Filesystem durch Lese-Modus ermittelt werden konnte, wird die Variable für MQTT Modus auf true gesetzt -> Daten können versendet werden
  }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// SWITCH-MODE

  // Liest Struktur des RTC memory
  // ist der Speicher wie der Klon des Speichers? Dient der Sicherheit
  if (ESP.rtcUserMemoryRead(0, (uint32_t*) &rtcData, sizeof(rtcData))) {
    uint32_t crcOfData = calculateCRC32((uint8_t*) &rtcData.data[0], sizeof(rtcData.data));
    if (crcOfData != rtcData.crc32) {
      Serial.println("CRC32 in RTC memory doesn't match CRC32 of data. Data is probably invalid!");
    } else {
      Serial.println("CRC32 check ok, data is probably valid.");
    }
  }

  // hier findet der eigentliche Wechsel zwischen den Zuständen Sniffen/Senden statt
    if(rtcData.data[0] == 1 && filesystem_available == true){      // wenn der RTC Speicher an der Stelle 0 eine 1 aufweist und das Filesystem vorhanden ist, wird an den Mosquitto Server gesendet
      rtcData.data[0] = 2;                   // es wird eine neue Datenmenge generiert, wieder wird nur die erste Stelle des Speichers verändert

      Serial.println("Zustand MQTT");    // Zur Kontrolle wird der Zustand MQTT in die Konsole ausgegeben
  
      setup_wifi();                         // die Funktion zur Verbindung zum WIFI wird aufgerufen
      client.setServer(mqtt_server, 1883);  // der Server und der zugehörige Port werden übergeben 

      WiFi_MQTT_connect = true;        // der Zustand MQTT wird innerhalb eines Bools true gesetzt
      WiFi_Sniffer_connect = false;    // der Zustand Sniffen wird innerhalb eines Bools false gesetzt
    
    }else if(rtcData.data[0] != 1 && filesystem_available == false){   // wenn der RTC Speicher an der Stelle 0 keine 1 aufweist und das Filesystem nicht vorhanden ist, wird gesnifft/Daten gesammelt
      rtcData.data[0] = 1;                  // es wird eine neue Datenmenge generiert, wieder wird nur die erste Stelle des Speichers verändert
      
      Serial.println("Zustand Sniffen");    // Zur Kontrolle wird der Zustand Sniffen in die Konsole ausgegeben

      // folgende Zeilen verwandeln den ESP8266 in einen promiskuitiven WiFi-Scanner
      delay(10);                            // es erfolgt eine sehr (!) kurze Pause
      wifi_set_opmode(STATION_MODE);        // "Betriebsart" des WIFI 
      wifi_set_channel(1);                  // Festlegung des Channels
      wifi_promiscuous_enable(DISABLE);     // promiskuitiver Modus wird deaktiviert
      delay(10);                            // es erfolgt eine sehr (!) kurze Pause
      wifi_set_promiscuous_rx_cb(sniffer_callback);  // Callback zum eigentlichen Sniffen wird aufgerufen 
      delay(10);                            // es erfolgt eine sehr (!) kurze Pause
      wifi_promiscuous_enable(ENABLE);      // promiskuitiver Modus wird aktiviert
    
      // Einstellen des Channel Hoping Callback Timers
      os_timer_disarm(&channelHop_timer);
      os_timer_setfn(&channelHop_timer, (os_timer_func_t *) channelHop, NULL);
      os_timer_arm(&channelHop_timer, CHANNEL_HOP_INTERVAL_MS, 1);

      WiFi_MQTT_connect = false;       // der Zustand MQTT wird innerhalb eines Bools false gesetzt
      WiFi_Sniffer_connect = true;     // der Zustand Sniffen wird innerhalb eines Bools true gesetzt
      
   }

  rtcData.crc32 = calculateCRC32((uint8_t*) &rtcData.data[0], sizeof(rtcData.data));   // CRC32 der Daten aktualisieren
  if (ESP.rtcUserMemoryWrite(0, (uint32_t*) &rtcData, sizeof(rtcData))) {              // Struktur in den RTC-Speicher schreiben
  }   

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

}


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// WLAN-SNIFFER (kalanda)

// Funktion wird nur aufgerufen, wenn der Sniffer Modus aktiv ist
static void showMetadata(SnifferPacket *snifferPacket) {

  unsigned int frameControl = ((unsigned int)snifferPacket->data[1] << 8) + snifferPacket->data[0];

  uint8_t version      = (frameControl & 0b0000000000000011) >> 0;
  uint8_t frameType    = (frameControl & 0b0000000000001100) >> 2;
  uint8_t frameSubType = (frameControl & 0b0000000011110000) >> 4;
  uint8_t toDS         = (frameControl & 0b0000000100000000) >> 8;
  uint8_t fromDS       = (frameControl & 0b0000001000000000) >> 9;

  // ESP8266 sucht nur nach "probe request" Paketen
  if (frameType != TYPE_MANAGEMENT ||
      frameSubType != SUBTYPE_PROBE_REQUEST)
        return;

  Serial.print("Topic :" + Topic);    // Konsole gibt die festgelegte Topic des ESP8266 aus 

  // Konsole gibt den empfangenen RSSI Wert aus
  Serial.print(" RSSI: ");
  Serial.print(snifferPacket->rx_ctrl.rssi, DEC);

  // Konsole gibt die empfangene MAC-Adresse aus
  char addr[] = "00:00:00:00:00:00";
  getMAC(addr, snifferPacket->data, 10);
  Serial.print(" Peer MAC: ");
  Serial.print(addr);
  
  // empfangene RSSI-Werte/MAC-Adressen werden in Strings umgewandelt 
  String String_rssi = String(snifferPacket->rx_ctrl.rssi, DEC);
  String String_addr = addr;
  
  Serial.println();  // Funktionsweise eines Zeilenumbruchs

  // alle ermittelten Werte werden in das Filesystem abgelegt 
  f.print("Topic: " + Topic + " RSSI: " + String_rssi + " MAC: " + addr);
  f.println();  // Funktionsweise eines Zeilenumbruchs

}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// SWITCH-MODE

// Zyklische Redundanzprüfung - logisch
// ist ein Verfahren zur Bestimmung eines Prüfwerts für Daten, um Fehler bei der Übertragung oder Speicherung erkennen zu können

// es rechnet, es funktioniert
uint32_t calculateCRC32(const uint8_t *data, size_t length) {
  uint32_t crc = 0xffffffff;
  while (length--) {
    uint8_t c = *data++;
    for (uint32_t i = 0x80; i > 0; i >>= 1) {
      bool bit = crc & 0x80000000;
      if (c & i) {
        bit = !bit;
      }
      crc <<= 1;
      if (bit) {
        crc ^= 0x04c11db7;
      }
    }
  }
  return crc;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// SWITCH-TIME

// definiere Bool, welcher über das Aktivieren des DeepSleep Modus entscheidet und somit einen Wechsel der Modi hervorruft
void switchStatement(){
    if (((millis() - lastMillis) > Waiting_Time)){   // checkt, ob die angegebene "Wartezeit" bereits abgelaufen ist, wenn ja...
        lastMillis = millis();  
        switch_state = true;    //...darf der DeepSleep Modus aktiviert werden
    }
    else {
      switch_state = false;  // ansonsten passiert nichts
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// MQTT-STUFF

void setup_wifi() {

  //die Verbindung zum Netzwerk wird hergestellt
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  //ESP 8266versucht sich einzuloggen
  WiFi.begin(ssid, password);

  //Während noch keine Verbindung besteht, werden Punkte ausgegeben 
  //WiFi.status() gibt den Status der WiFi-Verbindung zurück
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  //Sobald eine Verbindung besteht wird dies ausgegeben
  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

//Funktion für den Fall, dass keine Verbindung aufgebaut werden kann bzw. die Verbindung verloren ging
void reconnect() {
  
  // Loopt, bis ESP8266 wieder eine Verbindung hat 
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    //Client versucht sich zu verbinden
    if (client.connect("ESP8266ClientPublisher2")) {
      Serial.println("connected");
    } 
    else {

      //Falls keine Verbindung hergestellt werden konnte, wird nach 5 Sekunden ein Neuversuch gestartet 
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


void loop() {
  delay(1000);  // es erfolgt eine kurze Verzögerung 

  switchStatement();  // Funktion zur Berechnung der abgelaufenen "Wartezeit"

  if(switch_state == true){  // wenn die "Wartezeit" abgelaufen ist, wird....
    f.close();  //..das Filesystem bzw. die zugehörige Datei geschlossen 

    if(WiFi_MQTT_connect == true && filesystem_available == true){  // falls der vor dem DeepSleep des ESP8266 der MQTT Modus aktiv war, wird...
      SPIFFS.remove("/MAC-Daten.txt");  //...das Filesystem mit den bereits versendeten Daten gelöscht, sodass im kommenden Sniffing Modus neue Daten gesammelt werden können
    }
    
    Serial.println("Going into deep sleep");  // zur Kontrolle wird dies in die Konsole ausgegeben
    ESP.deepSleep(1000);   // der DeepSleep dauert exakt eine Sekunde, anschließend startet der ESP8266 den Code neu
    delay(200);   // es erfolgt eine sehr (!) kurze Verzögerung 
  }
  
  if(WiFi_MQTT_connect == true){   // Falls sich der ESP8266 im MQTT-Modus befindet ...
    
    //...kann der Client eingehende Nachrichten empfangen und selbst welche verschicken
    client.loop();

    //solange der ESP8266 nicht mit dem WIFI-Netwerk verbunden ist, wird versucht, sich neu zu verbinden 
    if (!client.connected()) {
      reconnect();
    }

    // solange das Filesystem verfügbar ist, in welchem sich die zu sendenden Daten befinden...
    while (f.available()){
      //....wird Zeile für Zeile das Filesystem ausgelesen 
      String line = f.readStringUntil('\n');
      Serial.println(line);  // zur Kontrolle wird das Ausgelesene in die Konsole geprintet
  
      delay(1000);  // es erfolgt eine kurze Verzögerung
      char Line_Array[line.length()+1];   
      line.toCharArray(Line_Array, line.length()+1);  // die ausgelesenen Werte des Filesystems werden zur Übertragung per MQTT in ein Char-Array verpackt
      client.publish("vendy", Line_Array);  // der ESP8266 publisht als Client unter der angegebenen Topic die abgespeicherten Werte 
    }
  }
}
