const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;
const HOST = '127.0.0.1';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'SecureTorPass123!';

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'jewelry-store-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

db.serialize(function () {
  db.run(
    'CREATE TABLE IF NOT EXISTS products (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'title TEXT NOT NULL, ' +
      'price REAL NOT NULL, ' +
      'description TEXT, ' +
      'weight TEXT, ' +
      'size TEXT, ' +
      'image TEXT' +
    ')'
  );

  db.run(
    'CREATE TABLE IF NOT EXISTS leads (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ' +
      'contact TEXT NOT NULL, ' +
      'country TEXT, ' +
      'product_id INTEGER' +
    ')'
  );
});

function readView(filename) {
  return fs.readFileSync(path.join(__dirname, 'views', filename), 'utf8');
}

function escapeHtml(str) {
  if (str === null || str === undefined) {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.get('/', function (req, res) {
  db.all('SELECT * FROM products ORDER BY id DESC', [], function (err, products) {
    if (err) {
      return res.status(500).send('Database error');
    }

    var productHtml = '';

    if (!products || products.length === 0) {
      productHtml = '<p class="no-products">No sterling silver pieces are listed yet. Please check back soon.</p>';
    } else {
      products.forEach(function (p) {
        var imageBlock = p.image
          ? '<img src="/uploads/' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" class="product-image">'
          : '<div class="product-image-placeholder">Image Pending</div>';

        productHtml +=
          '<div class="product-card">' +
            imageBlock +
            '<h2 class="product-title">' + escapeHtml(p.title) + '</h2>' +
            '<p class="product-price">' + escapeHtml(p.price) + ' XMR</p>' +
            '<p class="product-description">' + escapeHtml(p.description) + '</p>' +
            '<p class="product-meta">Weight: ' + escapeHtml(p.weight) + ' | Size: ' + escapeHtml(p.size) + '</p>' +
            '<a href="/checkout?id=' + p.id + '" class="buy-button">Buy Anonymously</a>' +
          '</div>';
      });
    }

    var html = readView('index.html');
    html = html.replace('<!-- PRODUCTS_PLACEHOLDER -->', productHtml);
    res.type('html').send(html);
  });
});

app.get('/checkout', function (req, res) {
  res.sendFile(path.join(__dirname, 'views', 'checkout.html'));
});

app.post('/submit-order', function (req, res) {
  var contact = req.body.contact;
  var country = req.body.country;
  var product_id = req.body.product_id;

  db.run(
    'INSERT INTO leads (contact, country, product_id) VALUES (?, ?, ?)',
    [contact, country, product_id],
    function (err) {
      if (err) {
        return res.status(500).send(
          '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Submission Error</title></head>' +
          '<body><h1>Order Submission Failed</h1><p>We could not record your inquiry. Please try again.</p>' +
          '<p><a href="/">Return to storefront</a></p></body></html>'
        );
      }

      res.send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Order Received</title></head>' +
        '<body><h1>Order Received</h1>' +
        '<p>Thank you for your anonymous jewelry inquiry. Our team will reach out through your provided contact channel.</p>' +
        '<p>Secure Crypto Checkout via Monero — your privacy is preserved throughout the process.</p>' +
        '<p><a href="/">Return to storefront</a></p></body></html>'
      );
    }
  );
});

app.get('/admin-login', function (req, res) {
  if (req.session.isAdmin) {
    return res.redirect('/admin-dashboard');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/admin-login', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin-dashboard');
  }

  res.status(401).send(
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Login Failed</title></head>' +
    '<body><h1>Login Failed</h1><p>Invalid username or password.</p>' +
    '<p><a href="/admin-login">Try again</a></p></body></html>'
  );
});

app.get('/admin-dashboard', function (req, res) {
  if (!req.session.isAdmin) {
    return res.redirect('/admin-login');
  }

  db.all('SELECT * FROM leads ORDER BY id DESC', [], function (err, leads) {
    if (err) {
      return res.status(500).send('Database error');
    }

    var leadsHtml = '';

    if (!leads || leads.length === 0) {
      leadsHtml = '<tr><td colspan="5">No leads recorded yet.</td></tr>';
    } else {
      leads.forEach(function (lead) {
        leadsHtml +=
          '<tr>' +
            '<td>' + lead.id + '</td>' +
            '<td>' + escapeHtml(lead.timestamp) + '</td>' +
            '<td>' + escapeHtml(lead.contact) + '</td>' +
            '<td>' + escapeHtml(lead.country) + '</td>' +
            '<td>' + escapeHtml(lead.product_id) + '</td>' +
          '</tr>';
      });
    }

    var html = readView('admin.html');
    html = html.replace('<!-- LEADS_PLACEHOLDER -->', leadsHtml);
    res.type('html').send(html);
  });
});

app.post('/admin/add-product', upload.single('image'), function (req, res) {
  if (!req.session.isAdmin) {
    return res.redirect('/admin-login');
  }

  var title = req.body.title;
  var price = req.body.price;
  var description = req.body.description;
  var weight = req.body.weight;
  var size = req.body.size;
  var image = req.file ? req.file.filename : null;

  db.run(
    'INSERT INTO products (title, price, description, weight, size, image) VALUES (?, ?, ?, ?, ?, ?)',
    [title, price, description, weight, size, image],
    function (err) {
      if (err) {
        return res.status(500).send('Failed to add product');
      }
      res.redirect('/admin-dashboard');
    }
  );
});

app.listen(PORT, HOST, function () {
  console.log('Jewelry store listening on http://' + HOST + ':' + PORT);
});
