onst sqlite3 = require('sqlite3').verbose(); //Benötigt ein SQLite Modul

// öffnet DB im Verzeichnis
let db = new sqlite3.Database('./vendy-database-02.db', sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the TEST-Datenbank.');
});


////////////////////////////////
// schließt die DB Verbindung
db.close((err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Close the database connection.');
});
