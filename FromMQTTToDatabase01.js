
//initialisiere database
const sqlite3 = require('sqlite3').verbose();

//database spezifikation
let db = new sqlite3.Database('./db/vendy-database-02.db');

//Globale Variablen
////////////////////////////////////////////////////////////////////////////////////////////////////////
var txPower = -59.0;                                    //Rechenwert zum Ausrechnen von Distanzen
var rssi                                                //Globale Variable rssi ist hier noch nicht gefüllt
var mac                                                 //Globale Variable mac ist hier noch nicht gefüllt
var distance                                            //Globale Variable distance hier noch nicht gefüllt
var esp                                                 //Globale Variable esp ist hier noch nicht gefüllt

var topic1 = 'Eingang';                                   //ESP-Topics zum abonieren
var topic2 = 'Fensterreihe';
var topic3 = 'Chillarea';
var y = 0                                //ESP-Topics zum abonieren


//MQTT-Brocker einrichten, abonnieren und publishen von Nachrichten
////////////////////////////////////////////////////////////////////////////////////////////////////////
var mqtt = require('mqtt')                              //MQTT Initialisieren
var client  = mqtt.connect('mqtt://192.168.8.105')     //Verbindung zum Server durch IP-Adresse (I-Net-Adresse des Computers auf dem der Server läuft)
var messageText
//console.log("bis hier hin");                                       //Variable ist hier noch nicht gefüllt

client.on('connect', function () {                      //Funktion zum Aufbau der Verbindung
                              //Signalisiert eine aufrechte Verbindung
  client.subscribe(topic1);                             //Abonniert das gewünschte Topic
  client.subscribe(topic2);
  client.subscribe(topic3);
  //client.publish('published');
  console.log("connected");                        //Veröffentlicht etwas unter dem "debug"-Topic
})

client.on('message', function (topic, message) {        //Funktion die die ankommenden Messages abfängt und ausgibt
  messageText = message.toString();                     //Variable wird mit der Brokermessage gefüllt
  //console.log(messageText)                            //Brokermessage wird in die Konsole geschrieben
  //client.end()                                        //Beendet das Abonnoment
})
////////////////////////////////////////////////////////////////////////////////////////////////////////


//Generiert Variablen aus der empfangenen Nachricht/bricht den String wieder auf
////////////////////////////////////////////////////////////////////////////////////////////////////////
client.on('message', function textfilter(message) {     //Funktion die die ankommenden Messages in Bestandteile zerlegt, textfilter = Funktionsname

    //Globale Variablen zur Bestimmung der aktuellen Zeit
    var heute = new Date();                                 //startet ein neues Date-Objekt
    var stunden = heute.getHours();                         //bezieht du stunden aus dem Date-Objekt
    var minuten = heute.getMinutes();                       //bezieht die minutzen aus dem Date-Objekt
    var sekunden = heute.getSeconds();                      //bezieht die sekunden aus dem Date-Objekt
    var time1;
    var time2;
    var time3;

    if(sekunden < 10){
      time1 = '0' + sekunden;
    }else{
      time1 = sekunden;
    }

    if(minuten < 10){
      time2 = '0' + minuten;
    }else{
      time2 = minuten;
    }

    if(stunden < 10){
      time3 = '0' + stunden;
    }else{
      time3 = stunden;
    }

    var time = time3+':'+time2+':'+time1;            //erstellt eine Variable "zeit" aus allen einzelnen Objekten
    ////////////////////////////////////////////////////////////////////////////////////////////////////////


  var match = messageText.match(/Topic: ([A-z]+) RSSI: (-\d\d) MAC: ([a-f0-9:]+)/);  //Sucht nach Matches innerhalb der ankommenden Message mithilfe von regular Expressions
                                                                                     //Regular Expressions https://regexr.com/
  if (!match) {                                         //Wird ausgeführt wenn kein Match gefunden wird
    console.log("TEST");
    return;                                             //Gibt die Matches zurück
  }
        esp = match[1];                                 //Füllt die globale Variable mit dem ersten Match
        rssi = match[2];                                //Füllt die globale Variable mit dem zweiten Match
        mac = match[3];                                 //Füllt die globale Variable mit dem dritten Match

     //Umrechnung des RSSI-Wertes in Metern
     var ratio = match[2]*1.0/txPower;

     if (ratio < 1.0){
         console.log(Math.pow(ratio,10));
        } else {
            distance = (0.89976)*Math.pow(ratio,7.7095)+0.111; //Speichert die Rechnung in die distance-Variable
            console.log(distance);                      //Schreibt die errechnete Distanz in die Konsole
        }

     //Schreibt die einzelnen Variablen und Werte in die Datenbank
     ////////////////////////////////////////////////////////////////////////////////////////////////////////
     db.run('CREATE TABLE Mac(ESP text, Adress text, Distance real, Time text)',function(error){ //erstelle eine Tabelle falls noch nicht vorahnden
      if(error){                                        //Meldet Fehler falls Datenbank schon vorhanden
        console.log(error.message);                     //Meldet Fehler falls Datenbank schon vorhanden
      }
    });
console.log('hallo');
        db.run('INSERT INTO Mac(ESP,Adress,Distance,Time) VALUES(?,?,?,?)', [esp, mac, distance, time], function(err) { //Schreibt vier Werte in die Vier Spalten der Datenbank
            if (err) {                                  //Meldet Fehler falls der Schreibvorgang fehlgeschlagen ist
              return console.log(err.message);          //Meldet Fehler falls der Schreibvorgang fehlgeschlagen ist
            }
            console.log(`A row has been inserted with rowid ${this.lastID}`); //Meldet Bestätigung falls der Schreibvorgang erfolgreich war
          });



     ////////////////////////////////////////////////////////////////////////////////////////////////////////

})

////////////////////////////////////////////////////////////////////////////////////////////////////////
//db.close();                                               //Schließt die Datenbank
