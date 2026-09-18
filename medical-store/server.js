const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const seedMedicines = require('./lib/seed-medicines');

const app = express();
const PORT = 8080;
const HOST = '127.0.0.1';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'SecureTorPass123!';

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }
];

const COLLECTIONS = {
  all: { title: 'All Medicines', desc: 'Browse our complete catalog of prescription medications, pain relief, and wellness supplements.' },
  prescription: { title: 'Prescription Medications', desc: 'Physician-directed medications dispensed with full clinical documentation and verification.' },
  wellness: { title: 'Wellness & Supplements', desc: 'Premium vitamins and supplements supporting daily health and immune function.' },
  'pain-relief': { title: 'Pain Relief', desc: 'Over-the-counter and physician-guided options for pain and inflammation management.' }
};

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
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'med-doorshipp-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

function migrateColumns() {
  ['category TEXT', 'slug TEXT'].forEach(function (col) {
    db.run('ALTER TABLE products ADD COLUMN ' + col, function () {});
  });
  [
    'first_name TEXT', 'last_name TEXT', 'email TEXT', 'contact_number TEXT',
    'shipping_street TEXT', 'shipping_city TEXT', 'shipping_state TEXT', 'shipping_postal TEXT', 'shipping_country TEXT',
    'billing_street TEXT', 'billing_city TEXT', 'billing_state TEXT', 'billing_postal TEXT', 'billing_country TEXT',
    'secondary_phone TEXT', 'shipping_line2 TEXT', 'billing_line2 TEXT', 'billing_first_name TEXT', 'billing_last_name TEXT',
    'shipping_method TEXT', 'order_notes TEXT', 'marketing_consent INTEGER', 'terms_accepted INTEGER', 'cart_snapshot TEXT'
  ].forEach(function (col) {
    db.run('ALTER TABLE leads ADD COLUMN ' + col, function () {});
  });
}

db.serialize(function () {
  db.run(
    'CREATE TABLE IF NOT EXISTS products (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, price_usd TEXT NOT NULL, ' +
      'description TEXT, dosage_strength TEXT, precautions TEXT, image TEXT, category TEXT, slug TEXT' +
    ')'
  );
  db.run(
    'CREATE TABLE IF NOT EXISTS leads (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, ' +
      'contact_handle TEXT, destination_country TEXT, selected_product_id INTEGER, ' +
      'first_name TEXT, last_name TEXT, email TEXT, contact_number TEXT, ' +
      'shipping_street TEXT, shipping_city TEXT, shipping_state TEXT, shipping_postal TEXT, shipping_country TEXT, ' +
      'billing_street TEXT, billing_city TEXT, billing_state TEXT, billing_postal TEXT, billing_country TEXT, ' +
      'secondary_phone TEXT, shipping_line2 TEXT, billing_line2 TEXT, billing_first_name TEXT, billing_last_name TEXT, ' +
      'shipping_method TEXT, order_notes TEXT, marketing_consent INTEGER, terms_accepted INTEGER, cart_snapshot TEXT' +
    ')'
  );
  migrateColumns();
  seedCatalog();
});

function seedCatalog() {
  db.get('SELECT COUNT(*) AS count FROM products WHERE slug IS NOT NULL AND slug != ""', [], function (err, row) {
    if (err || (row && row.count >= seedMedicines.length)) return;
    db.run('DELETE FROM products', [], function () {
      var stmt = db.prepare(
        'INSERT INTO products (title, price_usd, description, dosage_strength, precautions, image, category, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      seedMedicines.forEach(function (med) {
        stmt.run([med.title, med.price_usd, med.description, med.dosage_strength, med.precautions, med.image, med.category, med.slug]);
      });
      stmt.finalize();
      console.log('Seeded ' + seedMedicines.length + ' medicines');
    });
  });
}

function readView(filename) {
  return fs.readFileSync(path.join(__dirname, 'views', filename), 'utf8');
}

function readPartial(name) {
  return fs.readFileSync(path.join(__dirname, 'views', 'partials', name + '.html'), 'utf8');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatPriceUsd(price) {
  var num = parseFloat(price);
  if (isNaN(num)) return escapeHtml(price);
  return '$' + num.toFixed(2) + ' USD';
}

function truncateText(text, maxLen) {
  var safe = String(text || '');
  if (safe.length <= maxLen) return escapeHtml(safe);
  return escapeHtml(safe.substring(0, maxLen).trim()) + '&hellip;';
}

function getCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

function getCartCount(req) {
  return getCart(req).reduce(function (sum, item) { return sum + item.quantity; }, 0);
}

function renderLayout(html, req) {
  var header = readPartial('header').replace('<!-- CART_COUNT -->', String(getCartCount(req)));
  var footer = readPartial('footer').replace('<!-- YEAR -->', String(new Date().getFullYear()));
  return html.replace('<!-- HEADER -->', header).replace('<!-- FOOTER -->', footer);
}

function renderPage(viewPath, req, replacements) {
  var html = readView(viewPath);
  Object.keys(replacements || {}).forEach(function (key) {
    html = html.split('<!-- ' + key + ' -->').join(replacements[key]);
  });
  return renderLayout(html, req);
}

function productImageSrc(p) {
  if (!p || !p.image) return null;
  if (p.image.indexOf('products/') === 0) return '/images/' + p.image;
  return '/uploads/' + p.image;
}

function buildProductImage(p, cssClass, wrapped) {
  var src = productImageSrc(p);
  var inner = src
    ? '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(p.title) + '" class="' + cssClass + '">'
    : '<div class="product-image-placeholder" aria-label="' + escapeHtml(p.title) + '">Medicine Preview</div>';
  return wrapped ? '<div class="product-image-wrap">' + inner + '</div>' : inner;
}

function buildPrecautionsDrawer(productId, precautionsText) {
  var safeText = escapeHtml(precautionsText || 'Consult your attending physician prior to dispensation.');
  var lines = safeText.split('\n').filter(function (l) { return l.trim().length > 0; });
  var bodyContent = lines.length === 0
    ? '<p class="drawer-text">' + safeText + '</p>'
    : lines.map(function (line) { return '<p class="drawer-text">' + line.trim() + '</p>'; }).join('');
  return (
    '<details class="luxury-drawer" id="precautions-' + productId + '">' +
      '<summary class="luxury-drawer-trigger">Medical Precautions &amp; Contraindications</summary>' +
      '<div class="luxury-drawer-panel"><h4 class="drawer-title">Clinical Safety Advisory</h4>' + bodyContent +
      '<p class="drawer-note">Review all precautions before requesting door delivery.</p></div></details>'
  );
}

function buildCatalogCard(p) {
  return (
    '<article class="product-card">' +
      '<a href="/product/' + p.id + '">' + buildProductImage(p, 'product-image', true) + '</a>' +
      '<div class="product-card-body">' +
        '<p class="product-meta-line">' + escapeHtml(p.category || 'medicine') + ' · ' + escapeHtml(p.dosage_strength) + '</p>' +
        '<h2 class="product-title"><a href="/product/' + p.id + '">' + escapeHtml(p.title) + '</a></h2>' +
        '<p class="product-price">' + formatPriceUsd(p.price_usd) + '</p>' +
        '<p class="product-description">' + truncateText(p.description, 100) + '</p>' +
        '<div class="product-actions">' +
          '<a href="/product/' + p.id + '" class="btn-secondary">View Details</a>' +
          '<form action="/cart/add" method="POST" class="inline-form">' +
            '<input type="hidden" name="product_id" value="' + p.id + '">' +
            '<input type="hidden" name="quantity" value="1">' +
            '<button type="submit" class="btn-primary">Add to Cart</button>' +
          '</form>' +
        '</div></div></article>'
  );
}

function buildStateOptions() {
  return US_STATES.map(function (s) {
    return '<option value="' + s.code + '">' + escapeHtml(s.name) + '</option>';
  }).join('');
}

function buildOrderSummaryItems(products) {
  if (!products || products.length === 0) {
    return '<p class="order-summary-empty">Your cart is empty. <a href="/collections">Browse medicines</a></p>';
  }
  var html = '';
  var subtotal = 0;
  products.forEach(function (p) {
    subtotal += parseFloat(p.price_usd) * p.cartQty;
    var src = productImageSrc(p);
    var img = src
      ? '<img src="' + escapeHtml(src) + '" alt="" class="cart-line-image">'
      : '<div class="cart-line-image cart-line-placeholder"></div>';
    html +=
      '<div class="cart-line-item">' + img +
        '<div class="cart-line-details">' +
          '<h3>' + escapeHtml(p.title) + '</h3>' +
          '<p class="order-summary-meta">Qty ' + p.cartQty + ' · ' + escapeHtml(p.dosage_strength) + '</p>' +
          '<p class="order-summary-price">' + formatPriceUsd(parseFloat(p.price_usd) * p.cartQty) + '</p>' +
        '</div></div>';
  });
  html += '<div class="cart-subtotal-row"><span>Subtotal</span><span>' + formatPriceUsd(subtotal) + '</span></div>';
  return html;
}

function maskPhone(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return escapeHtml(phone || '');
  return '***-***-' + escapeHtml(digits.slice(-4));
}

function buildRequestNumber(leadId) {
  return 'MD-' + String(leadId).padStart(6, '0');
}

function loadCartProducts(req, callback) {
  var cart = getCart(req);
  if (cart.length === 0) return callback(null, []);
  var ids = cart.map(function (c) { return c.product_id; });
  var placeholders = ids.map(function () { return '?'; }).join(',');
  db.all('SELECT * FROM products WHERE id IN (' + placeholders + ')', ids, function (err, products) {
    if (err) return callback(err);
    var merged = products.map(function (p) {
      var cartItem = cart.find(function (c) { return c.product_id === p.id; });
      return Object.assign({}, p, { cartQty: cartItem ? cartItem.quantity : 1 });
    });
    callback(null, merged);
  });
}

function buildCategoryFilters(active) {
  var cats = [
    { key: '', label: 'All' },
    { key: 'prescription', label: 'Prescription' },
    { key: 'wellness', label: 'Wellness' },
    { key: 'pain-relief', label: 'Pain Relief' }
  ];
  return cats.map(function (c) {
    var href = c.key ? '/collections?category=' + c.key : '/collections';
    var cls = (active || '') === c.key ? 'filter-pill active' : 'filter-pill';
    return '<a href="' + href + '" class="' + cls + '">' + c.label + '</a>';
  }).join('');
}

app.get('/', function (req, res) {
  db.all('SELECT * FROM products ORDER BY id ASC', [], function (err, products) {
    if (err) return res.status(500).send('Database error');
    var productHtml = !products || products.length === 0
      ? '<p class="no-products">Our pharmacy catalog is being updated. Please check back soon.</p>'
      : products.map(buildCatalogCard).join('');
    res.type('html').send(renderPage('index.html', req, { PRODUCTS_PLACEHOLDER: productHtml }));
  });
});

app.get('/collections', function (req, res) {
  var category = req.query.category || '';
  var meta = COLLECTIONS[category] || COLLECTIONS.all;
  var query = category
    ? 'SELECT * FROM products WHERE category = ? ORDER BY id ASC'
    : 'SELECT * FROM products ORDER BY id ASC';
  var params = category ? [category] : [];
  db.all(query, params, function (err, products) {
    if (err) return res.status(500).send('Database error');
    var productHtml = !products || products.length === 0
      ? '<p class="no-products">No medicines in this collection yet.</p>'
      : products.map(buildCatalogCard).join('');
    res.type('html').send(renderPage('collections.html', req, {
      COLLECTION_TITLE: escapeHtml(meta.title),
      COLLECTION_DESC: escapeHtml(meta.desc),
      CATEGORY_FILTERS: buildCategoryFilters(category),
      PRODUCTS_PLACEHOLDER: productHtml
    }));
  });
});

app.get('/product/:id', function (req, res) {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], function (err, p) {
    if (err) return res.status(500).send('Database error');
    if (!p) {
      return res.status(404).send(renderLayout(
        '<main class="page-centered section-padding"><div class="container-shell success-card"><h1>Medicine Not Found</h1><p><a href="/collections" class="btn-primary">Browse Catalog</a></p></div></main>', req
      ));
    }
    var html = renderPage('product.html', req, {});
    html = html.replace(/<!-- PRODUCT_TITLE -->/g, escapeHtml(p.title));
    html = html.replace('<!-- PRODUCT_PRICE -->', formatPriceUsd(p.price_usd));
    html = html.replace('<!-- PRODUCT_DOSAGE -->', escapeHtml(p.dosage_strength));
    html = html.replace('<!-- PRODUCT_DESCRIPTION -->', escapeHtml(p.description));
    html = html.replace('<!-- PRODUCT_IMAGE -->', buildProductImage(p, 'product-image'));
    html = html.replace('<!-- PRODUCT_ID -->', String(p.id));
    html = html.replace('<!-- PRECAUTIONS_BLOCK -->', buildPrecautionsDrawer(p.id, p.precautions));
    html = html.replace('<!-- PRODUCT_CATEGORY -->', escapeHtml(p.category || 'medicine'));
    res.type('html').send(html);
  });
});

app.post('/cart/add', function (req, res) {
  var productId = parseInt(req.body.product_id, 10);
  var quantity = parseInt(req.body.quantity, 10) || 1;
  var cart = getCart(req);
  var existing = cart.find(function (c) { return c.product_id === productId; });
  if (existing) existing.quantity += quantity;
  else cart.push({ product_id: productId, quantity: quantity });
  var redirect = req.body.redirect || req.get('Referer') || '/cart';
  res.redirect(redirect);
});

app.post('/cart/update', function (req, res) {
  var productId = parseInt(req.body.product_id, 10);
  var quantity = parseInt(req.body.quantity, 10);
  var cart = getCart(req).filter(function (c) { return c.product_id !== productId; });
  if (quantity > 0) cart.push({ product_id: productId, quantity: quantity });
  req.session.cart = cart;
  res.redirect('/cart');
});

app.post('/cart/remove', function (req, res) {
  req.session.cart = getCart(req).filter(function (c) { return c.product_id !== parseInt(req.body.product_id, 10); });
  res.redirect('/cart');
});

app.get('/cart', function (req, res) {
  loadCartProducts(req, function (err, products) {
    if (err) return res.status(500).send('Database error');
    var content = '';
    var checkoutCta = '';
    if (products.length === 0) {
      content = '<div class="cart-empty"><p>Your cart is empty.</p><a href="/collections" class="btn-primary">Browse Medicines</a></div>';
    } else {
      content = '<div class="cart-items-list">';
      products.forEach(function (p) {
        var src = productImageSrc(p);
        content +=
          '<article class="cart-page-item">' +
            (src ? '<img src="' + escapeHtml(src) + '" alt="" class="cart-line-image">' : '<div class="cart-line-image cart-line-placeholder"></div>') +
            '<div class="cart-line-details">' +
              '<h2>' + escapeHtml(p.title) + '</h2>' +
              '<p class="order-summary-meta">' + escapeHtml(p.dosage_strength) + '</p>' +
              '<p class="order-summary-price">' + formatPriceUsd(p.price_usd) + ' each</p>' +
              '<form action="/cart/update" method="POST" class="cart-qty-form">' +
                '<input type="hidden" name="product_id" value="' + p.id + '">' +
                '<label>Qty <input type="number" name="quantity" value="' + p.cartQty + '" min="1" max="99"></label>' +
                '<button type="submit" class="btn-secondary btn-sm">Update</button>' +
              '</form>' +
              '<form action="/cart/remove" method="POST" class="inline-form">' +
                '<input type="hidden" name="product_id" value="' + p.id + '">' +
                '<button type="submit" class="btn-ghost">Remove</button>' +
              '</form>' +
            '</div></article>';
      });
      content += '</div>';
      checkoutCta = '<a href="/checkout" class="btn-primary">Continue to Checkout</a>';
    }
    res.type('html').send(renderPage('cart.html', req, { CART_CONTENT: content, CHECKOUT_CTA: checkoutCta }));
  });
});

app.get('/checkout', function (req, res) {
  var productId = req.query.product_id || req.query.id;
  function sendCheckout(products) {
    var html = renderPage('checkout.html', req, {});
    html = html.replace('<!-- ORDER_SUMMARY -->', buildOrderSummaryItems(products));
    html = html.replace('<!-- PRODUCT_ID -->', products.length === 1 ? String(products[0].id) : '');
    html = html.replace(/<!-- US_STATES_OPTIONS -->/g, buildStateOptions());
    res.type('html').send(html);
  }
  if (productId) {
    db.get('SELECT * FROM products WHERE id = ?', [productId], function (err, p) {
      sendCheckout(p ? [Object.assign({}, p, { cartQty: 1 })] : []);
    });
    return;
  }
  loadCartProducts(req, function (err, products) {
    if (err) return res.status(500).send('Database error');
    sendCheckout(products);
  });
});

function buildConfirmationPage(req, leadId, orderData, products) {
  var secondaryNote = orderData.secondary_phone
    ? '<p class="editorial-lead" style="margin-top:1rem;">Your secondary contact number has also been included for our team.</p>' : '';
  var orderSelection = '';
  if (products && products.length > 0) {
    orderSelection =
      '<div style="margin-top:2.5rem;"><h2 class="form-section-title">Your Selection</h2>' +
      buildOrderSummaryItems(products) +
      '<div class="confirmation-details" style="margin-top:1.5rem;">' +
        '<div class="confirmation-row"><span>Shipping</span><span>To be confirmed by our team</span></div>' +
        '<div class="confirmation-row"><span>Payment</span><span>To be arranged with Med Doorshipp</span></div>' +
      '</div></div>';
  }
  var html = renderPage('confirmation.html', req, {});
  html = html.replace('<!-- REQUEST_NUMBER -->', escapeHtml(buildRequestNumber(leadId)));
  html = html.replace('<!-- CONFIRM_EMAIL -->', escapeHtml(orderData.email));
  html = html.replace('<!-- CONFIRM_PHONE -->', maskPhone(orderData.contact_number));
  html = html.replace('<!-- SECONDARY_PHONE_NOTE -->', secondaryNote);
  html = html.replace('<!-- ORDER_SELECTION -->', orderSelection);
  return html;
}

app.post('/submit-order', function (req, res) {
  var body = req.body;
  if (body.terms_accepted !== 'on') {
    return res.status(400).send(renderLayout(
      '<main class="page-centered section-padding"><div class="container-shell success-card error-card"><h1>Terms Required</h1><p>Please accept the terms to continue.</p><a href="/checkout" class="btn-primary">Return to Checkout</a></div></main>',
      req
    ));
  }
  loadCartProducts(req, function (err, cartProducts) {
    var product_id = body.product_id || (cartProducts[0] ? cartProducts[0].id : null);
    var cart_snapshot = JSON.stringify(cartProducts.map(function (p) {
      return { id: p.id, title: p.title, qty: p.cartQty, price: p.price_usd };
    }));
    var billing_street = body.billing_street, billing_city = body.billing_city;
    var billing_state = body.billing_state, billing_postal = body.billing_postal;
    if (body.billing_same_as_shipping === 'on') {
      billing_street = body.shipping_street; billing_city = body.shipping_city;
      billing_state = body.shipping_state; billing_postal = body.shipping_postal;
    }
    db.run(
      'INSERT INTO leads (selected_product_id, first_name, last_name, email, contact_number, secondary_phone, ' +
      'shipping_street, shipping_line2, shipping_city, shipping_state, shipping_postal, shipping_country, ' +
      'billing_first_name, billing_last_name, billing_street, billing_line2, billing_city, billing_state, billing_postal, billing_country, ' +
      'shipping_method, order_notes, marketing_consent, terms_accepted, cart_snapshot, contact_handle, destination_country) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        product_id, body.first_name, body.last_name, body.email, body.contact_number, body.secondary_phone || '',
        body.shipping_street, body.shipping_line2 || '', body.shipping_city, body.shipping_state, body.shipping_postal,
        body.shipping_country || 'United States',
        body.billing_first_name || body.first_name, body.billing_last_name || body.last_name,
        billing_street, body.billing_line2 || '', billing_city, billing_state, billing_postal,
        body.shipping_country || 'United States',
        body.shipping_method || 'standard', body.order_notes || '',
        body.marketing_consent === 'on' ? 1 : 0, 1, cart_snapshot,
        body.email, body.shipping_country || 'United States'
      ],
      function (insertErr) {
        if (insertErr) {
          return res.status(500).send(renderLayout(
            '<main class="page-centered section-padding"><div class="container-shell success-card error-card"><h1>Request Unsuccessful</h1><a href="/checkout" class="btn-primary">Return to Checkout</a></div></main>', req
          ));
        }
        req.session.cart = [];
        res.send(buildConfirmationPage(req, this.lastID, {
          email: body.email, contact_number: body.contact_number, secondary_phone: body.secondary_phone
        }, cartProducts));
      }
    );
  });
});

['contact', 'privacy', 'refund-policy', 'terms', 'shipping', 'our-story'].forEach(function (slug) {
  app.get('/' + slug, function (req, res) {
    res.type('html').send(renderPage('pages/' + slug + '.html', req, {}));
  });
});

app.post('/contact', function (req, res) {
  res.type('html').send(renderPage('pages/contact.html', req, {})
    .replace('</main>', '<div class="notice-success container-shell"><p>Thank you, ' + escapeHtml(req.body.name) + '. Our pharmacy team will respond within one business day.</p></div></main>'));
});

app.get('/admin-login', function (req, res) {
  if (req.session.isAdmin) return res.redirect('/admin-dashboard');
  res.type('html').send(renderPage('login.html', req, {}));
});

app.post('/admin-login', function (req, res) {
  if (req.body.username === ADMIN_USERNAME && req.body.password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin-dashboard');
  }
  res.status(401).send(renderLayout(
    '<main class="page-centered section-padding"><div class="container-shell success-card error-card"><h1>Access Denied</h1><a href="/admin-login">Return</a></div></main>', req
  ));
});

app.get('/admin-dashboard', function (req, res) {
  if (!req.session.isAdmin) return res.redirect('/admin-login');
  db.all(
    'SELECT leads.*, products.title AS product_title, products.price_usd AS product_price FROM leads LEFT JOIN products ON leads.selected_product_id = products.id ORDER BY leads.id DESC',
    [],
    function (err, leads) {
      if (err) return res.status(500).send('Database error');
      var leadsHtml = !leads || leads.length === 0
        ? '<tr><td colspan="9">No orders recorded.</td></tr>'
        : leads.map(function (lead) {
            var name = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || lead.email || '—';
            return '<tr><td>' + lead.id + '</td><td>' + escapeHtml(lead.timestamp) + '</td><td>' + escapeHtml(name) +
              '</td><td>' + escapeHtml(lead.email) + '</td><td>' + escapeHtml(lead.contact_number) + '</td><td>' +
              escapeHtml(lead.shipping_city) + ', ' + escapeHtml(lead.shipping_country) + '</td><td>' +
              escapeHtml(lead.product_title || '—') + '</td><td>' + (lead.product_price ? formatPriceUsd(lead.product_price) : '—') +
              '</td><td>' + escapeHtml(lead.selected_product_id) + '</td></tr>';
          }).join('');
      res.type('html').send(renderPage('admin.html', req, { LEADS_PLACEHOLDER: leadsHtml }));
    }
  );
});

app.post('/admin/add-product', upload.single('image'), function (req, res) {
  if (!req.session.isAdmin) return res.redirect('/admin-login');
  db.run(
    'INSERT INTO products (title, price_usd, description, dosage_strength, precautions, image) VALUES (?, ?, ?, ?, ?, ?)',
    [req.body.title, req.body.price_usd, req.body.description, req.body.dosage_strength, req.body.precautions, req.file ? req.file.filename : null],
    function (err) { res.redirect(err ? '/admin-login' : '/admin-dashboard'); }
  );
});

app.listen(PORT, HOST, function () {
  console.log('Med Doorshipp portal listening on http://' + HOST + ':' + PORT);
});
