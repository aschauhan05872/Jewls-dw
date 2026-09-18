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
  destination: function (req, file, cb) { cb(null, uploadsDir); },
  filename: function (req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'voyage-jewelry-session',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

db.serialize(function () {
  db.run(
    'CREATE TABLE IF NOT EXISTS products (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, price_usd TEXT NOT NULL, ' +
      'description TEXT, weight TEXT, size TEXT, care_instructions TEXT, image TEXT)'
  );
  db.run(
    'CREATE TABLE IF NOT EXISTS leads (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ' +
      'contact_handle TEXT, destination_country TEXT, selected_product_id INTEGER, ' +
      'first_name TEXT, last_name TEXT, email TEXT, contact_number TEXT, ' +
      'shipping_street TEXT, shipping_city TEXT, shipping_state TEXT, shipping_postal TEXT, shipping_country TEXT, ' +
      'billing_street TEXT, billing_city TEXT, billing_state TEXT, billing_postal TEXT, billing_country TEXT)'
  );
});

function readView(f) { return fs.readFileSync(path.join(__dirname, 'views', f), 'utf8'); }

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatPriceUsd(price) {
  var n = parseFloat(price);
  return isNaN(n) ? escapeHtml(price) : '$' + n.toFixed(2) + ' USD';
}

function truncateText(t, max) {
  var s = String(t || '');
  return s.length <= max ? escapeHtml(s) : escapeHtml(s.substring(0, max).trim()) + '&hellip;';
}

function buildProductImage(p, cls) {
  return p.image
    ? '<img src="/uploads/' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" class="' + cls + '">'
    : '<div class="product-image-placeholder" aria-label="' + escapeHtml(p.title) + '">Jewelry Preview</div>';
}

function buildCareDrawer(id, text) {
  var lines = escapeHtml(text || 'Handle with care. Store in provided pouch away from moisture.').split('\n').filter(function(l){ return l.trim(); });
  var body = lines.length ? lines.map(function(l){ return '<p class="drawer-text">' + l.trim() + '</p>'; }).join('') : '<p class="drawer-text">' + escapeHtml(text) + '</p>';
  return '<details class="luxury-drawer"><summary class="luxury-drawer-trigger">Care &amp; Handling Instructions</summary><div class="luxury-drawer-panel"><h4 class="drawer-title">Jewelry Care Advisory</h4>' + body + '</div></details>';
}

function buildCatalogCard(p) {
  return '<article class="product-card"><a href="/product/' + p.id + '">' + buildProductImage(p, 'product-image') + '</a>' +
    '<div class="product-card-body"><h2 class="product-title"><a href="/product/' + p.id + '">' + escapeHtml(p.title) + '</a></h2>' +
    '<p class="product-price">' + formatPriceUsd(p.price_usd) + '</p>' +
    '<p class="product-description">' + truncateText(p.description, 140) + '</p>' +
    '<p class="product-meta">Weight: ' + escapeHtml(p.weight) + ' | Size: ' + escapeHtml(p.size) + '</p>' +
    '<div class="product-actions"><a href="/product/' + p.id + '" class="detail-button">View Details</a>' +
    '<a href="/checkout?product_id=' + p.id + '" class="buy-button">Proceed to Checkout</a></div></div></article>';
}

function buildOrderSummary(p) {
  if (!p) return '<p class="order-summary-empty">No piece selected. <a href="/">Browse collection</a></p>';
  return '<div class="order-summary-card">' + buildProductImage(p, 'order-summary-image') +
    '<div class="order-summary-details"><h3>' + escapeHtml(p.title) + '</h3><p class="order-summary-price">' + formatPriceUsd(p.price_usd) + '</p>' +
    '<p class="order-summary-meta">' + escapeHtml(p.weight) + ' · ' + escapeHtml(p.size) + '</p></div></div>';
}

app.get('/', function (req, res) {
  db.all('SELECT * FROM products ORDER BY id DESC', [], function (err, products) {
    if (err) return res.status(500).send('Database error');
    var html = products && products.length ? products.map(buildCatalogCard).join('') : '<p class="no-products">New collection arriving soon.</p>';
    res.type('html').send(readView('index.html').replace('<!-- PRODUCTS_PLACEHOLDER -->', html));
  });
});

app.get('/product/:id', function (req, res) {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], function (err, p) {
    if (err) return res.status(500).send('Database error');
    if (!p) return res.status(404).send('Not found');
    var html = readView('product.html');
    html = html.replace(/<!-- PRODUCT_TITLE -->/g, escapeHtml(p.title));
    html = html.replace('<!-- PRODUCT_PRICE -->', formatPriceUsd(p.price_usd));
    html = html.replace('<!-- PRODUCT_META -->', 'Weight: ' + escapeHtml(p.weight) + ' | Size: ' + escapeHtml(p.size));
    html = html.replace('<!-- PRODUCT_DESCRIPTION -->', escapeHtml(p.description));
    html = html.replace('<!-- PRODUCT_IMAGE -->', buildProductImage(p, 'product-image'));
    html = html.replace('<!-- PRODUCT_ID -->', String(p.id));
    html = html.replace('<!-- CARE_BLOCK -->', buildCareDrawer(p.id, p.care_instructions));
    res.type('html').send(html);
  });
});

app.get('/checkout', function (req, res) {
  var pid = req.query.product_id || req.query.id;
  function render(p) {
    var html = readView('checkout.html');
    html = html.replace('<!-- ORDER_SUMMARY -->', buildOrderSummary(p));
    html = html.replace('<!-- PRODUCT_ID -->', p ? String(p.id) : '');
    res.type('html').send(html);
  }
  if (!pid) return render(null);
  db.get('SELECT * FROM products WHERE id = ?', [pid], function (err, p) { render(p || null); });
});

app.post('/submit-order', function (req, res) {
  var b = req.body;
  var billing = {
    street: b.billing_street, city: b.billing_city, state: b.billing_state,
    postal: b.billing_postal, country: b.billing_country
  };
  if (b.billing_same_as_shipping === 'on') {
    billing = { street: b.shipping_street, city: b.shipping_city, state: b.shipping_state, postal: b.shipping_postal, country: b.shipping_country };
  }
  db.run(
    'INSERT INTO leads (selected_product_id, first_name, last_name, email, contact_number, shipping_street, shipping_city, shipping_state, shipping_postal, shipping_country, billing_street, billing_city, billing_state, billing_postal, billing_country, contact_handle, destination_country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [b.product_id, b.first_name, b.last_name, b.email, b.contact_number, b.shipping_street, b.shipping_city, b.shipping_state, b.shipping_postal, b.shipping_country, billing.street, billing.city, billing.state, billing.postal, billing.country, b.email, b.shipping_country],
    function (err) {
      if (err) return res.status(500).send('Error');
      res.send('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Order Confirmed</title><link rel="stylesheet" href="/css/luxury.css"></head><body class="page-centered"><main class="success-card"><h1>Order Received</h1><p>Thank you, <strong>' + escapeHtml(b.first_name) + ' ' + escapeHtml(b.last_name) + '</strong>. Your Voyage jewelry order has been placed.</p><p class="success-highlight">Our concierge team will contact you at <strong>' + escapeHtml(b.email) + '</strong> within <strong>24 hours</strong> to confirm white-glove delivery details.</p><a href="/" class="buy-button">Return to Collection</a></main></body></html>');
    }
  );
});

app.get('/admin-login', function (req, res) {
  if (req.session.isAdmin) return res.redirect('/admin-dashboard');
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/admin-login', function (req, res) {
  if (req.body.username === ADMIN_USERNAME && req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin-dashboard');
  }
  res.status(401).send('Access denied');
});

app.get('/admin-dashboard', function (req, res) {
  if (!req.session.isAdmin) return res.redirect('/admin-login');
  db.all('SELECT leads.*, products.title AS product_title, products.price_usd AS product_price FROM leads LEFT JOIN products ON leads.selected_product_id = products.id ORDER BY leads.id DESC', [], function (err, leads) {
    if (err) return res.status(500).send('Database error');
    var rows = !leads || !leads.length ? '<tr><td colspan="9">No orders yet.</td></tr>' : leads.map(function (l) {
      var name = ((l.first_name||'')+' '+(l.last_name||'')).trim() || l.email || '—';
      return '<tr><td>'+l.id+'</td><td>'+escapeHtml(l.timestamp)+'</td><td>'+escapeHtml(name)+'</td><td>'+escapeHtml(l.email)+'</td><td>'+escapeHtml(l.contact_number)+'</td><td>'+escapeHtml(l.shipping_city)+', '+escapeHtml(l.shipping_country)+'</td><td>'+escapeHtml(l.product_title)+'</td><td>'+formatPriceUsd(l.product_price)+'</td><td>'+l.selected_product_id+'</td></tr>';
    }).join('');
    res.type('html').send(readView('admin.html').replace('<!-- LEADS_PLACEHOLDER -->', rows));
  });
});

app.post('/admin/add-product', upload.single('image'), function (req, res) {
  if (!req.session.isAdmin) return res.redirect('/admin-login');
  db.run('INSERT INTO products (title, price_usd, description, weight, size, care_instructions, image) VALUES (?,?,?,?,?,?,?)',
    [req.body.title, req.body.price_usd, req.body.description, req.body.weight, req.body.size, req.body.care_instructions, req.file ? req.file.filename : null],
    function (err) { if (err) return res.status(500).send('Failed'); res.redirect('/admin-dashboard'); });
});

app.listen(PORT, HOST, function () { console.log('Voyage Jewelry at http://' + HOST + ':' + PORT); });
