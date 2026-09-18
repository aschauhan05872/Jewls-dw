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
  secret: 'voyage-medical-session-secret',
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

function truncateText(text, maxLen) {
  var safe = String(text || '');
  if (safe.length <= maxLen) {
    return escapeHtml(safe);
  }
  return escapeHtml(safe.substring(0, maxLen).trim()) + '&hellip;';
}

function buildProductImage(p, cssClass) {
  if (p.image) {
    return '<img src="/uploads/' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" class="' + cssClass + '">';
  }
  return '<div class="product-image-placeholder" aria-label="' + escapeHtml(p.title) + '">Clinical Asset Preview</div>';
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
      '<summary class="luxury-drawer-trigger">Medical Precautions &amp; Clinical Contraindications</summary>' +
      '<div class="luxury-drawer-panel">' +
        '<h4 class="drawer-title">Clinical Safety Advisory</h4>' +
        bodyContent +
        '<p class="drawer-note">Review all storage precautions before requesting white-glove door-shipment courier service.</p>' +
      '</div>' +
    '</details>'
  );
}

function buildCatalogCard(p) {
  return (
    '<article class="product-card">' +
      '<a href="/product/' + p.id + '">' + buildProductImage(p, 'product-image') + '</a>' +
      '<div class="product-card-body">' +
        '<h2 class="product-title"><a href="/product/' + p.id + '">' + escapeHtml(p.title) + '</a></h2>' +
        '<p class="product-price">' + formatPriceUsd(p.price_usd) + '</p>' +
        '<p class="product-description">' + truncateText(p.description, 140) + '</p>' +
        '<p class="product-meta">Dosage Strength: ' + escapeHtml(p.dosage_strength) + '</p>' +
        '<div class="product-actions">' +
          '<a href="/product/' + p.id + '" class="detail-button">View Details</a>' +
          '<a href="/checkout?product_id=' + p.id + '" class="buy-button">Request Courier</a>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

app.get('/', function (req, res) {
  db.all('SELECT * FROM products ORDER BY id DESC', [], function (err, products) {
    if (err) {
      return res.status(500).send('Database error');
    }

    var productHtml = '';

    if (!products || products.length === 0) {
      productHtml = '<p class="no-products">Our executive pharmacy catalog is being curated. Please check back soon.</p>';
    } else {
      products.forEach(function (p) {
        productHtml += buildCatalogCard(p);
      });
    }

    var html = readView('index.html');
    html = html.replace('<!-- PRODUCTS_PLACEHOLDER -->', productHtml);
    res.type('html').send(html);
  });
});

app.get('/product/:id', function (req, res) {
  var productId = req.params.id;

  db.get('SELECT * FROM products WHERE id = ?', [productId], function (err, p) {
    if (err) {
      return res.status(500).send('Database error');
    }
    if (!p) {
      return res.status(404).send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Not Found</title>' +
        '<link rel="stylesheet" href="/css/luxury.css"></head>' +
        '<body class="page-centered"><main class="success-card">' +
        '<h1>Clinical Asset Not Found</h1><p><a href="/">Return to catalog</a></p></main></body></html>'
      );
    }

    var html = readView('product.html');
    html = html.replace(/<!-- PRODUCT_TITLE -->/g, escapeHtml(p.title));
    html = html.replace('<!-- PRODUCT_PRICE -->', formatPriceUsd(p.price_usd));
    html = html.replace('<!-- PRODUCT_DOSAGE -->', escapeHtml(p.dosage_strength));
    html = html.replace('<!-- PRODUCT_DESCRIPTION -->', escapeHtml(p.description));
    html = html.replace('<!-- PRODUCT_IMAGE -->', buildProductImage(p, 'product-image'));
    html = html.replace('<!-- PRODUCT_ID -->', String(p.id));
    html = html.replace('<!-- PRECAUTIONS_BLOCK -->', buildPrecautionsDrawer(p.id, p.precautions));
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
          '<body class="page-centered"><main class="success-card">' +
          '<h1>Courier Request Unsuccessful</h1>' +
          '<p>We could not record your intake. Please try again.</p>' +
          '<a href="/" class="buy-button">Return to Catalog</a></main></body></html>'
        );
      }

      res.send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Request Confirmed</title>' +
        '<link rel="stylesheet" href="/css/luxury.css"></head>' +
        '<body class="page-centered"><main class="success-card">' +
        '<h1>White-Glove Courier Intake Received</h1>' +
        '<p>Your executive pharmacy dispensation inquiry has been securely logged.</p>' +
        '<p class="success-highlight">A dedicated operations coordinator will contact you through your provided handle within <strong>24 hours</strong> to finalize secure end-to-end encrypted logistics.</p>' +
        '<a href="/" class="buy-button">Return to Clinical Catalog</a></main></body></html>'
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
    '<body class="page-centered"><main class="success-card">' +
    '<h1>Access Denied</h1><p>Invalid credentials.</p>' +
    '<a href="/admin-login">Return to entrance</a></main></body></html>'
  );
});

app.get('/admin-dashboard', function (req, res) {
  if (!req.session.isAdmin) {
    return res.redirect('/admin-login');
  }

  var query =
    'SELECT leads.id, leads.timestamp, leads.contact_handle, leads.destination_country, ' +
    'leads.selected_product_id, products.title AS product_title, products.price_usd AS product_price ' +
    'FROM leads LEFT JOIN products ON leads.selected_product_id = products.id ' +
    'ORDER BY leads.id DESC';

  db.all(query, [], function (err, leads) {
    if (err) {
      return res.status(500).send('Database error');
    }

    var leadsHtml = '';

    if (!leads || leads.length === 0) {
      leadsHtml = '<tr><td colspan="7">No active shipping requests recorded.</td></tr>';
    } else {
      leads.forEach(function (lead) {
        leadsHtml +=
          '<tr>' +
            '<td>' + lead.id + '</td>' +
            '<td>' + escapeHtml(lead.timestamp) + '</td>' +
            '<td>' + escapeHtml(lead.contact_handle) + '</td>' +
            '<td>' + escapeHtml(lead.destination_country) + '</td>' +
            '<td>' + escapeHtml(lead.selected_product_id) + '</td>' +
            '<td>' + (lead.product_title ? escapeHtml(lead.product_title) : '—') + '</td>' +
            '<td>' + (lead.product_price ? formatPriceUsd(lead.product_price) : '—') + '</td>' +
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

  db.run(
    'INSERT INTO products (title, price_usd, description, dosage_strength, precautions, image) VALUES (?, ?, ?, ?, ?, ?)',
    [
      req.body.title,
      req.body.price_usd,
      req.body.description,
      req.body.dosage_strength,
      req.body.precautions,
      req.file ? req.file.filename : null
    ],
    function (err) {
      if (err) {
        return res.status(500).send('Failed to add clinical product');
      }
      res.redirect('/admin-dashboard');
    }
  );
});

app.listen(PORT, HOST, function () {
  console.log('Voyage Medical store listening on http://' + HOST + ':' + PORT);
});
