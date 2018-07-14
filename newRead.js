////----------> in dieser JS Datei wird die Datenbank sortiert und zusammengefasst<------------/////


const sqlite3 = require('sqlite3').verbose();                                       //Benötigt ein SQLite Modul
const writer = require('./TemplateWriteIntoDatabase')                               // greift auf die TemplateWriteIntoDatabase.js zu
const pruefer = require('./FromMQTTToDatabase01.js')                                // greift auf die FromMQTTToDatabase01.js zu


// Für jede Spalte wird ein Array erstellt: so bekommt jeder Wert eine eindeutige id, auf die zugegriffen werden kann

var macArray = [];
var espArray = [];
var timeArray = [];
var distanceArray = [];
var i = 0;


// öffnet DB im Verzeichnis
var db = new sqlite3.Database('./db/vendy-database-02.db');


//einzelne Spalten werden aus der Tabelle 'Mac' ausgewählt (bei der Distanz nur der Mindestwert - da sich hier die MacAdresse am ehesten beim Stand befindet)
// gruppiert und nacheinander nach Adresse, Zeit (aufsteigend) und Distanz (hier wird nochmal gesagt das 'Distance' den Datentyp REAL hat) geordnet
var order = `SELECT
                Adress, ESP, Time, MIN(Distance) as Distance

            FROM
                Mac

            GROUP BY
                Adress, ESP, Time

            ORDER BY
                Adress, Time ASC, CAST(Distance as REAL);`


db.all(order, [], (err, rows) => {
  if (err) {
    throw err;
  }

  //in die Arrays werden die Werte aus den Spalten der DB hinzugefügt
  rows.forEach((row) => {

    macArray.push(row.Adress)                                                       //im Array 'macArray' befinden sich nun die MacAdressen 'Adress', usw.
    espArray.push(row.ESP)
    timeArray.push(row.Time)
    distanceArray.push(row.Distance)

    });



    // *** Start - und Endzeit einer MacAdresse, die sich an einem Stand befindet müssen erfasst werden ***//
    //           - Die Startzeit soll von der Endzeit subtrahiert werden
    //           - Differenz ergibt die Dauer des Aufenthalts an einem bestimmten Ort

    var startTime = timeArray[0];                                                   // Startzeit
    var endTime = 0;                                                                // Endzeit

    var counterArray = [];                                                          // Array, in das später alle Werte eingefügt werden



    //***** Vorher müssen noch überflüssige Zeilen, in denen ein Nutzer gleichzeitig von verschiedenen ESPs erfasst wird, rausgeschmissen werden *****//
    for (var i = 0; i < macArray.length; i++) {                                     //Tabelle ist nach MacAdressen sortiert; die Zeilen werden nacheinander überprüft

        //Bedingung: Wenn die selbe MacAdresse zur gleichen Zeit von verschiedenen ESPs erfasst wird
        if(macArray[i] == macArray[i+1] && timeArray[i] == timeArray[i+1] && espArray[i] != espArray[i+1])  {

            //dann wird überprüft welcher Abstand der Größere ist
            if(distanceArray[i] < distanceArray [i+1]) {

                    //löscht die ganze nächste Reihe
                    macArray.splice(i+1, 1)
                    timeArray.splice(i+1,1)
                    distanceArray.splice(i+1,1)
                    espArray.splice(i+1,1)

                    //der aktuelle Index i muss nun mit i+2(übernächster Wert) überprüft werden, da i+1 gelöscht wurde
                    // da er aber eben überprüft wurde und man durch i++ in die nächste Zeile rutschen würde, würde die Schleife das überspringen
                    //deshalb wird i-1 gerechnet
                    i = i-1

             } else if(distanceArray[i] > distanceArray [i+1]) {                    //selbes Spiel, nur der Fall, dass der aktuelle Wert wegen dem größeren Abstand rasugeschmissen werden muss

                    macArray.splice(i, 1)
                    timeArray.splice(i, 1)
                    distanceArray.splice(i, 1)
                    espArray.splice(i, 1)

                    i = i-1

             } else if(distanceArray[i] == distanceArray [i+1]) {                   //der Fall das beide Abstände gleich sind
                                                                                    //falls nichts von oben ausgeführt wird
                           console.log('Beide Reihen werden ausgegeben.')

                 }else{                                                             //falls nichts von oben ausgeführt wird
                    console.log('Hier befindet sich ein Fehler')
             }

         }

        //damit bei zwei komplett identische Zeilen eime rausgeworfen wird:
         if(macArray[i] == macArray[i+1] && timeArray[i] == timeArray[i+1] && espArray[i] == espArray[i+1] && distanceArray[i]==distanceArray[i+1])  {

             macArray.splice(i, 1)
             timeArray.splice(i, 1)
             distanceArray.splice(i, 1)
             espArray.splice(i, 1)
             i = i-1

             console.log('Dopplung wurde rausgeschmissen.')


          } else{                                                                 //falls nichts von oben ausgeführt wird
                   console.log('Skip.')
            }

     }

     //***** nun sind alle überflüssigen Zeilen gelöscht worden *****//




    for (var i = 0; i < macArray.length; i++) {
            if (macArray[i] != macArray[i+1] || espArray[i] != espArray[i+1]){          //sobald die nächste Zeile nicht mehr der selben Adresse oder Standort entspricht, kann man der Zeile, die aktuell abgefragt wird, den zeitlichen Endwert (späteste Uhrzeit einer Person an einem Stand) zuordnen

                //**ENDZEIT**//
                    endTime = timeArray[i];                                             //aktuelle Endzeit der jeweiligen MacAdresse

                    var end     = endTime.substring(0, 2)//STUNDEN
                    var endMin  = endTime.substring(3, 5)//MINUTEN
                    var endSec  = endTime.substring(6, 8)//SEC

                    end         = end * 3600                                                //Stunden zu Sekunden umgerechnet
                    endMin      = endMin * 60                                               //Minuten in Sekunden umgerechnet
                    endTime     = Number(end) + Number(endMin) + Number(endSec)             //Endzeit: komplette Uhrzeit als Datentyp Number (vorher String) in SEC addiert

                //**STARTZEIT**//
                    var start   = startTime.substring(0, 2)//STUNDEN
                    var startMin = startTime.substring(3, 5)//MIN
                    var startSec = startTime.substring(6, 8)//SEC

                    start       = start * 3600                                                  //Stunden in SEC
                    startMin    = startMin * 60                                                 //Minuten in SEC
                    startTime   = Number(start) + Number(startMin) + Number(startSec)           //Startzeit: Ergebniss mit SEC zusammengerechnet


                    var timeCount = (Number(endTime) - Number(startTime))                         //timeCount zeigt die Differenz der Zeit in SEC an, also wie lange jemand an einem Stand war

                    //**gewünschtes Format: 00:00 Min**//
                    var timeCountMinutes = Math.floor(timeCount / 60)                              //in Minuten -> Kommazahlen
                    console.log(timeCountMinutes + ' Minuten ausgerechnet')                        //es wird abgerundet -> es ergibt sich der exakte Minutenwert

                    var timeCountSec        = Math.round(timeCount - (timeCountMinutes * 60))       //die genau Zahl der Sekunden ergibt sich, wenn die Minuten von der Kommazahl subtrahiert werden                                                                    //Millisekunden werden gerundet, * 60 damit Zeiteinheit stimmt
                    console.log(timeCountSec + ' Sekunden ausgerechnet')

                    //AUSGABE
                    timeCount           = timeCountMinutes + ':' + timeCountSec


                    //alle fertig sortierten und berechneten Spalten werden in ein Array eingefügt, dann kann die Tabelle ausgegeben und überprüft bzw. mit der neuen Tabelle verglichen werden

                    counterArray.push(macArray[i])
                    counterArray.push(espArray[i])
                    counterArray.push(distanceArray[i])
                    counterArray.push(timeCount)

                    startTime           = timeArray[i + 1]                              // der Index der Startzeit wird um eins erhöht

                    writer.newDB(macArray[i], espArray[i], timeCount)                   //übergabe an die Funktion 'newDB'


                } else  {
                    console.log('Hier könnte ihre Werbung stehen')                      //Fehlermeldung: wird angezeigt, wenn node in keine der beiden if-Abfragen reingeht
        }
    }


    console.log(counterArray)                                                           // Ausgabe der fertigen Tabelle
});



////////////////////////////////
// schließt DB Verbindung
db.close();
