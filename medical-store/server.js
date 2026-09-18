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
  secret: 'medical-store-executive-session',
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
      'price_usd TEXT NOT NULL, ' +
      'description TEXT, ' +
      'dosage_strength TEXT, ' +
      'precautions TEXT, ' +
      'image TEXT' +
    ')'
  );

  db.run(
    'CREATE TABLE IF NOT EXISTS leads (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ' +
      'contact_handle TEXT NOT NULL, ' +
      'destination_country TEXT, ' +
      'selected_product_id INTEGER' +
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

function formatPriceUsd(price) {
  var num = parseFloat(price);
  if (isNaN(num)) {
    return escapeHtml(price);
  }
  return '$' + num.toFixed(2) + ' USD';
}

function buildPrecautionsDrawer(productId, precautionsText) {
  var safeText = escapeHtml(precautionsText || 'Consult your attending physician prior to dispensation.');
  var lines = safeText.split('\n').filter(function (line) {
    return line.trim().length > 0;
  });

  var bodyContent = '';
  if (lines.length === 0) {
    bodyContent = '<p class="drawer-text">' + safeText + '</p>';
  } else {
    bodyContent = lines.map(function (line) {
      return '<p class="drawer-text">' + line.trim() + '</p>';
    }).join('');
  }

  return (
    '<details class="luxury-drawer" id="precautions-' + productId + '">' +
      '<summary class="luxury-drawer-trigger">' +
        'Medical Precautions &amp; Clinical Contraindications' +
      '</summary>' +
      '<div class="luxury-drawer-panel">' +
        '<h4 class="drawer-title">Clinical Safety Advisory</h4>' +
        bodyContent +
        '<p class="drawer-note">Review all storage precautions before requesting white-glove door-shipment courier service.</p>' +
      '</div>' +
    '</details>'
  );
}

app.get('/', function (req, res) {
  db.all('SELECT * FROM products ORDER BY id DESC', [], function (err, products) {
    if (err) {
      return res.status(500).send('Database error');
    }

    var productHtml = '';

    if (!products || products.length === 0) {
      productHtml =
        '<p class="catalog-status">Our executive pharmacy catalog is being curated. ' +
        'Return shortly for premium wellness dispensation listings.</p>';
    } else {
      products.forEach(function (p) {
        var imageBlock = p.image
          ? '<img src="/uploads/' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" class="luxury-card-image">'
          : '<div class="luxury-card-image-placeholder" aria-label="' + escapeHtml(p.title) + '">Clinical Asset</div>';

        productHtml +=
          '<article class="luxury-card">' +
            '<div class="luxury-card-media">' + imageBlock + '</div>' +
            '<div class="luxury-card-content">' +
              '<span class="dosage-badge">' + escapeHtml(p.dosage_strength) + '</span>' +
              '<h2 class="luxury-card-title">' + escapeHtml(p.title) + '</h2>' +
              '<p class="luxury-card-price">' + formatPriceUsd(p.price_usd) + '</p>' +
              '<p class="luxury-card-description">' + escapeHtml(p.description) + '</p>' +
              buildPrecautionsDrawer(p.id, p.precautions) +
              '<a href="/checkout?product_id=' + p.id + '" class="btn-luxury">Request White-Glove Courier</a>' +
            '</div>' +
          '</article>';
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
  var contact_handle = req.body.contact_handle;
  var destination_country = req.body.destination_country;
  var product_id = req.body.product_id;

  db.run(
    'INSERT INTO leads (contact_handle, destination_country, selected_product_id) VALUES (?, ?, ?)',
    [contact_handle, destination_country, product_id],
    function (err) {
      if (err) {
        return res.status(500).send(
          '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Request Error</title>' +
          '<link rel="stylesheet" href="/css/luxury.css"></head>' +
          '<body class="page-centered"><main class="success-card error-card">' +
          '<h1>Courier Request Unsuccessful</h1>' +
          '<p>We were unable to record your intake. Please verify your details and try again.</p>' +
          '<a href="/" class="btn-luxury">Return to Catalog</a></main></body></html>'
        );
      }

      res.send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Request Confirmed</title>' +
        '<link rel="stylesheet" href="/css/luxury.css"></head>' +
        '<body class="page-centered"><main class="success-card">' +
        '<span class="brand-eyebrow">Request Confirmed</span>' +
        '<h1>White-Glove Courier Intake Received</h1>' +
        '<p>Your executive pharmacy dispensation inquiry has been securely logged within our distribution ledger.</p>' +
        '<p class="success-highlight">A dedicated operations coordinator will contact you through your provided handle within <strong>24 hours</strong> to finalize secure end-to-end encrypted logistics.</p>' +
        '<a href="/" class="btn-luxury">Return to Clinical Catalog</a></main></body></html>'
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
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Access Denied</title>' +
    '<link rel="stylesheet" href="/css/luxury.css"></head>' +
    '<body class="page-centered"><main class="success-card error-card">' +
    '<h1>Access Denied</h1><p>Invalid administrative credentials.</p>' +
    '<a href="/admin-login" class="btn-luxury">Return to Entrance</a></main></body></html>'
  );
});

app.get('/admin-dashboard', function (req, res) {
  if (!req.session.isAdmin) {
    return res.redirect('/admin-login');
  }

  var query =
    'SELECT leads.id, leads.timestamp, leads.contact_handle, leads.destination_country, ' +
    'leads.selected_product_id, products.title AS product_title, products.price_usd AS product_price ' +
    'FROM leads ' +
    'LEFT JOIN products ON leads.selected_product_id = products.id ' +
    'ORDER BY leads.id DESC';

  db.all(query, [], function (err, leads) {
    if (err) {
      return res.status(500).send('Database error');
    }

    var leadsHtml = '';

    if (!leads || leads.length === 0) {
      leadsHtml = '<tr><td colspan="7">No active shipping requests in the distribution queue.</td></tr>';
    } else {
      leads.forEach(function (lead) {
        var productLabel = lead.product_title
          ? escapeHtml(lead.product_title)
          : 'Unassigned';
        var priceLabel = lead.product_price
          ? formatPriceUsd(lead.product_price)
          : '—';

        leadsHtml +=
          '<tr>' +
            '<td>' + lead.id + '</td>' +
            '<td>' + escapeHtml(lead.timestamp) + '</td>' +
            '<td>' + escapeHtml(lead.contact_handle) + '</td>' +
            '<td>' + escapeHtml(lead.destination_country) + '</td>' +
            '<td>' + escapeHtml(lead.selected_product_id) + '</td>' +
            '<td>' + productLabel + '</td>' +
            '<td>' + priceLabel + '</td>' +
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
  var price_usd = req.body.price_usd;
  var description = req.body.description;
  var dosage_strength = req.body.dosage_strength;
  var precautions = req.body.precautions;
  var image = req.file ? req.file.filename : null;

  db.run(
    'INSERT INTO products (title, price_usd, description, dosage_strength, precautions, image) VALUES (?, ?, ?, ?, ?, ?)',
    [title, price_usd, description, dosage_strength, precautions, image],
    function (err) {
      if (err) {
        return res.status(500).send('Failed to add clinical product');
      }
      res.redirect('/admin-dashboard');
    }
  );
});

app.listen(PORT, HOST, function () {
  console.log('Medical store portal listening on http://' + HOST + ':' + PORT);
});
