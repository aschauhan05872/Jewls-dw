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
  secret: 'med-doorshipp-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

function migrateLeadsColumns() {
  var columns = [
    'first_name TEXT',
    'last_name TEXT',
    'email TEXT',
    'contact_number TEXT',
    'shipping_street TEXT',
    'shipping_city TEXT',
    'shipping_state TEXT',
    'shipping_postal TEXT',
    'shipping_country TEXT',
    'billing_street TEXT',
    'billing_city TEXT',
    'billing_state TEXT',
    'billing_postal TEXT',
    'billing_country TEXT',
    'secondary_phone TEXT',
    'shipping_line2 TEXT',
    'billing_line2 TEXT',
    'billing_first_name TEXT',
    'billing_last_name TEXT',
    'shipping_method TEXT',
    'order_notes TEXT',
    'marketing_consent INTEGER',
    'terms_accepted INTEGER'
  ];

  columns.forEach(function (col) {
    db.run('ALTER TABLE leads ADD COLUMN ' + col, function () {});
  });
}

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
      'contact_handle TEXT, ' +
      'destination_country TEXT, ' +
      'selected_product_id INTEGER, ' +
      'first_name TEXT, ' +
      'last_name TEXT, ' +
      'email TEXT, ' +
      'contact_number TEXT, ' +
      'shipping_street TEXT, ' +
      'shipping_city TEXT, ' +
      'shipping_state TEXT, ' +
      'shipping_postal TEXT, ' +
      'shipping_country TEXT, ' +
      'billing_street TEXT, ' +
      'billing_city TEXT, ' +
      'billing_state TEXT, ' +
      'billing_postal TEXT, ' +
      'billing_country TEXT, ' +
      'secondary_phone TEXT, ' +
      'shipping_line2 TEXT, ' +
      'billing_line2 TEXT, ' +
      'billing_first_name TEXT, ' +
      'billing_last_name TEXT, ' +
      'shipping_method TEXT, ' +
      'order_notes TEXT, ' +
      'marketing_consent INTEGER, ' +
      'terms_accepted INTEGER' +
    ')'
  );

  migrateLeadsColumns();
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

function buildStateOptions() {
  return US_STATES.map(function (state) {
    return '<option value="' + state.code + '">' + escapeHtml(state.name) + '</option>';
  }).join('');
}

function maskPhone(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) {
    return escapeHtml(phone || '');
  }
  return '***-***-' + escapeHtml(digits.slice(-4));
}

function buildRequestNumber(leadId) {
  return 'MD-' + String(leadId).padStart(6, '0');
}

function buildProductImage(p, cssClass, wrapped) {
  var inner = p.image
    ? '<img src="/uploads/' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" class="' + cssClass + '">'
    : '<div class="product-image-placeholder" aria-label="' + escapeHtml(p.title) + '">Clinical Asset Preview</div>';

  if (wrapped) {
    return '<div class="product-image-wrap">' + inner + '</div>';
  }
  return inner;
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
      '<a href="/product/' + p.id + '">' + buildProductImage(p, 'product-image', true) + '</a>' +
      '<div class="product-card-body">' +
        '<p class="product-meta-line">' + escapeHtml(p.dosage_strength) + '</p>' +
        '<h2 class="product-title"><a href="/product/' + p.id + '">' + escapeHtml(p.title) + '</a></h2>' +
        '<p class="product-price">' + formatPriceUsd(p.price_usd) + '</p>' +
        '<p class="product-description">' + truncateText(p.description, 100) + '</p>' +
        '<div class="product-actions">' +
          '<a href="/product/' + p.id + '" class="btn-secondary">View Details</a>' +
          '<a href="/checkout?product_id=' + p.id + '" class="btn-primary">Order Request</a>' +
        '</div>' +
      '</div>' +
    '</article>'
  );
}

function buildOrderSummary(p) {
  if (!p) {
    return '<p class="order-summary-empty">No product selected. <a href="/">Browse catalog</a></p>';
  }

  var imageBlock = p.image
    ? '<img src="/uploads/' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.title) + '" class="order-summary-image">'
    : '<div class="order-summary-image-placeholder">Clinical Asset</div>';

  return (
    '<div class="order-summary-card">' +
      imageBlock +
      '<div class="order-summary-details">' +
        '<h3>' + escapeHtml(p.title) + '</h3>' +
        '<p class="order-summary-price">' + formatPriceUsd(p.price_usd) + '</p>' +
        '<p class="order-summary-meta">Dosage: ' + escapeHtml(p.dosage_strength) + '</p>' +
      '</div>' +
    '</div>'
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
  var productId = req.query.product_id || req.query.id;

  function renderCheckout(product) {
    var stateOptions = buildStateOptions();
    var html = readView('checkout.html');
    html = html.replace('<!-- ORDER_SUMMARY -->', buildOrderSummary(product));
    html = html.replace('<!-- PRODUCT_ID -->', product ? String(product.id) : '');
    html = html.replace(/<!-- US_STATES_OPTIONS -->/g, stateOptions);
    res.type('html').send(html);
  }

  if (!productId) {
    return renderCheckout(null);
  }

  db.get('SELECT * FROM products WHERE id = ?', [productId], function (err, product) {
    if (err) {
      return res.status(500).send('Database error');
    }
    renderCheckout(product || null);
  });
});

function buildConfirmationPage(leadId, orderData, product) {
  var secondaryNote = orderData.secondary_phone
    ? '<p class="editorial-lead" style="margin-top:1rem;">Your secondary contact number has also been included for our team.</p>'
    : '';

  var orderSelection = '';
  if (product) {
    orderSelection =
      '<div style="margin-top:2.5rem;">' +
        '<h2 class="form-section-title">Your Selection</h2>' +
        buildOrderSummary(product) +
        '<div class="confirmation-details" style="margin-top:1.5rem;">' +
          '<div class="confirmation-row"><span>Subtotal</span><span>' + formatPriceUsd(product.price_usd) + '</span></div>' +
          '<div class="confirmation-row"><span>Shipping</span><span>To be confirmed by our team</span></div>' +
          '<div class="confirmation-row"><span>Payment</span><span>To be arranged with Med Doorshipp</span></div>' +
        '</div>' +
      '</div>';
  }

  var html = readView('confirmation.html');
  html = html.replace('<!-- REQUEST_NUMBER -->', escapeHtml(buildRequestNumber(leadId)));
  html = html.replace('<!-- CONFIRM_EMAIL -->', escapeHtml(orderData.email));
  html = html.replace('<!-- CONFIRM_PHONE -->', maskPhone(orderData.contact_number));
  html = html.replace('<!-- SECONDARY_PHONE_NOTE -->', secondaryNote);
  html = html.replace('<!-- ORDER_SELECTION -->', orderSelection);
  return html;
}

app.post('/submit-order', function (req, res) {
  var body = req.body;
  var product_id = body.product_id;
  var first_name = body.first_name;
  var last_name = body.last_name;
  var email = body.email;
  var contact_number = body.contact_number;
  var secondary_phone = body.secondary_phone || '';
  var shipping_street = body.shipping_street;
  var shipping_line2 = body.shipping_line2 || '';
  var shipping_city = body.shipping_city;
  var shipping_state = body.shipping_state;
  var shipping_postal = body.shipping_postal;
  var shipping_country = body.shipping_country || 'United States';
  var billing_first_name = body.billing_first_name;
  var billing_last_name = body.billing_last_name;
  var billing_street = body.billing_street;
  var billing_line2 = body.billing_line2 || '';
  var billing_city = body.billing_city;
  var billing_state = body.billing_state;
  var billing_postal = body.billing_postal;
  var billing_country = shipping_country;
  var shipping_method = body.shipping_method || 'standard';
  var order_notes = body.order_notes || '';
  var marketing_consent = body.marketing_consent === 'on' ? 1 : 0;
  var terms_accepted = body.terms_accepted === 'on' ? 1 : 0;

  if (!terms_accepted) {
    return res.status(400).send(
      '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Terms Required</title>' +
      '<link rel="stylesheet" href="/css/luxury.css"></head>' +
      '<body class="page-centered"><main class="success-card error-card">' +
      '<h1>Terms Required</h1><p>Please accept the terms and conditions to continue.</p>' +
      '<a href="/checkout" class="btn-primary">Return to Checkout</a></main></body></html>'
    );
  }

  if (body.billing_same_as_shipping === 'on') {
    billing_first_name = first_name;
    billing_last_name = last_name;
    billing_street = shipping_street;
    billing_line2 = shipping_line2;
    billing_city = shipping_city;
    billing_state = shipping_state;
    billing_postal = shipping_postal;
  }

  db.run(
    'INSERT INTO leads (' +
      'selected_product_id, first_name, last_name, email, contact_number, secondary_phone, ' +
      'shipping_street, shipping_line2, shipping_city, shipping_state, shipping_postal, shipping_country, ' +
      'billing_first_name, billing_last_name, billing_street, billing_line2, billing_city, billing_state, billing_postal, billing_country, ' +
      'shipping_method, order_notes, marketing_consent, terms_accepted, ' +
      'contact_handle, destination_country' +
    ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      product_id, first_name, last_name, email, contact_number, secondary_phone,
      shipping_street, shipping_line2, shipping_city, shipping_state, shipping_postal, shipping_country,
      billing_first_name, billing_last_name, billing_street, billing_line2, billing_city, billing_state, billing_postal, billing_country,
      shipping_method, order_notes, marketing_consent, terms_accepted,
      email, shipping_country
    ],
    function (err) {
      if (err) {
        return res.status(500).send(
          '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Request Error</title>' +
          '<link rel="stylesheet" href="/css/luxury.css"></head>' +
          '<body class="page-centered"><main class="success-card error-card">' +
          '<h1>Request Unsuccessful</h1>' +
          '<p>We could not record your intake. Please verify all fields and try again.</p>' +
          '<a href="/checkout" class="btn-primary">Return to Checkout</a></main></body></html>'
        );
      }

      var leadId = this.lastID;
      var orderData = { email: email, contact_number: contact_number, secondary_phone: secondary_phone };

      if (!product_id) {
        return res.send(buildConfirmationPage(leadId, orderData, null));
      }

      db.get('SELECT * FROM products WHERE id = ?', [product_id], function (productErr, product) {
        res.send(buildConfirmationPage(leadId, orderData, productErr ? null : product));
      });
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
    '<h1>Access Denied</h1><p>Invalid credentials.</p>' +
    '<a href="/admin-login">Return to entrance</a></main></body></html>'
  );
});

app.get('/admin-dashboard', function (req, res) {
  if (!req.session.isAdmin) {
    return res.redirect('/admin-login');
  }

  var query =
    'SELECT leads.id, leads.timestamp, leads.first_name, leads.last_name, leads.email, leads.contact_number, ' +
    'leads.shipping_city, leads.shipping_country, leads.selected_product_id, ' +
    'products.title AS product_title, products.price_usd AS product_price ' +
    'FROM leads LEFT JOIN products ON leads.selected_product_id = products.id ' +
    'ORDER BY leads.id DESC';

  db.all(query, [], function (err, leads) {
    if (err) {
      return res.status(500).send('Database error');
    }

    var leadsHtml = '';

    if (!leads || leads.length === 0) {
      leadsHtml = '<tr><td colspan="9">No active shipping requests recorded.</td></tr>';
    } else {
      leads.forEach(function (lead) {
        var customerName = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim();
        if (!customerName && lead.email) {
          customerName = lead.email;
        }
        if (!customerName) {
          customerName = lead.contact_handle || '—';
        }

        leadsHtml +=
          '<tr>' +
            '<td>' + lead.id + '</td>' +
            '<td>' + escapeHtml(lead.timestamp) + '</td>' +
            '<td>' + escapeHtml(customerName) + '</td>' +
            '<td>' + escapeHtml(lead.email || lead.contact_handle) + '</td>' +
            '<td>' + escapeHtml(lead.contact_number) + '</td>' +
            '<td>' + escapeHtml(lead.shipping_city) + ', ' + escapeHtml(lead.shipping_country || lead.destination_country) + '</td>' +
            '<td>' + (lead.product_title ? escapeHtml(lead.product_title) : '—') + '</td>' +
            '<td>' + (lead.product_price ? formatPriceUsd(lead.product_price) : '—') + '</td>' +
            '<td>' + escapeHtml(lead.selected_product_id) + '</td>' +
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
  console.log('Med Doorshipp portal listening on http://' + HOST + ':' + PORT);
});
