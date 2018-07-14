// P6, Team 6, »vendy« , Jeannine Krämer, Sebastian Meidel, Uta Janzen, Raphael Herres, Marie Steinbrügge
// 2018 Sebastian Meidel

//initialisiere database
const sqlite3 = require('sqlite3').verbose();

//database spezifikation
let db = new sqlite3.Database('./db/vendy-database-01.db');

//Globale Variablen
////////////////////////////////////////////////////////////////////////////////////////////////////////
var txPower = -59.0;                                    //Rechenwert zum Ausrechnen von Distanzen
var rssi                                                //Globale Variable rssi ist hier noch nicht gefüllt
var mac                                                 //Globale Variable mac ist hier noch nicht gefüllt
var distance                                            //Globale Variable distance hier noch nicht gefüllt
var esp                                                 //Globale Variable esp ist hier noch nicht gefüllt
//Globale Variablen zur Bestimmung der aktuellen Zeit
var heute = new Date();                                 //startet ein neues Date-Objekt
var stunden = heute.getHours();                         //bezieht du stunden aus dem Date-Objekt
var minuten = heute.getMinutes();                       //bezieht die minutzen aus dem Date-Objekt
var sekunden = heute.getSeconds();                      //bezieht die sekunden aus dem Date-Objekt

var time1;
var time2;
var time3;

if(sekunde < 10){              //wenn Sekunden kleiner 10, wird eine Null angehängt
  time1 = '0' + sekunden;
}else{
  time1 = sekunden;
}

if(minuten < 10){              //wenn Minuten kleiner 10, wird eine Null angehängt
  time2 = '0' + minuten;
}else{
  time2 = minuten;
}

if(stunden < 10){              //wenn Stunden kleiner 10, wird eine Null angehängt
  time3 = '0' + stunden;
}else{
  time3 = stunden;
}

var time = time3+':'+time2+':'+time1;            //erstellt eine Variable "zeit" aus allen einzelnen Objekten
////////////////////////////////////////////////////////////////////////////////////////////////////////


//MQTT-Broker einrichten, abonnieren und publishen von Nachrichten
////////////////////////////////////////////////////////////////////////////////////////////////////////
var mqtt = require('mqtt')                              //MQTT Initialisieren
var client  = mqtt.connect('mqtt://192.168.178.38')     //Verbindung zum Server durch IP-Adresse (I-Net-Adresse des Computers auf dem der Server läuft)
var messageText                                         //Variable ist hier noch nicht gefüllt

client.on('connect', function () {                      //Funktion zum Aufbau der Verbindung
  //console.log("connected")                            //Signalisiert eine aufrechte Verbindung
  client.subscribe('vendy');                            //Abonniert das gewünschte Topic
  //client.publish('published');                        //Veröffentlicht etwas unter der "debug"-Topic
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
  var match = messageText.match(/Topic: ([a-z]+) RSSI: (-\d\d) MAC: ([a-f0-9:]+)/);  //Sucht nach Matches innerhalb der ankommenden Message mithilfe von regular Expressions
                                                                                     //Regular Expressions https://regexr.com/
  if (!match) {                                         //Wird ausgeführt wenn kein Match gefunden wird
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
