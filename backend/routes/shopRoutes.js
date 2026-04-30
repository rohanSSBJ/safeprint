const express = require('express');
const supabase = require('../lib/supabaseClient');

const router = express.Router();

const demoShops = [
  {
    id: 'demo-shop-campus-hub',
    name: 'Campus Print Hub',
    address: 'Main Road, Gachibowli, Hyderabad',
    location: [17.4432, 78.3518],
    status: 'free',
    upiId: 'campusprinthub@upi',
  },
  {
    id: 'demo-shop-xerox-point',
    name: 'Xerox Point Express',
    address: 'DLF Street, Gachibowli, Hyderabad',
    location: [17.4379, 78.3446],
    status: 'moderate',
    upiId: 'xeroxpointexpress@upi',
  },
  {
    id: 'demo-shop-study-lane',
    name: 'Study Lane Prints',
    address: 'Indira Nagar, Telecom Nagar, Hyderabad',
    location: [17.4471, 78.3583],
    status: 'busy',
    upiId: 'studylaneprints@upi',
  },
  {
    id: 'demo-shop-quick-copy',
    name: 'Quick Copy Corner',
    address: 'Near Botanical Garden Road, Kondapur, Hyderabad',
    location: [17.4328, 78.3634],
    status: 'free',
    upiId: 'quickcopycorner@upi',
  },
  {
    id: 'demo-shop-night-owl',
    name: 'Night Owl Prints',
    address: 'Anjaiah Nagar, Gachibowli, Hyderabad',
    location: [17.4394, 78.3401],
    status: 'closed',
    upiId: 'nightowlprints@upi',
  },
];

function publicShop(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address || '',
    location: [row.lat || 17.4401, row.lng || 78.3489],
    status: row.status || 'closed',
    ownerEmail: row.owner_email,
    upiId: row.upi_id || '',
  };
}

async function getShop(id) {
  const demoShop = demoShops.find((shop) => shop.id === id);
  if (demoShop) return demoShop;

  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Supabase shop lookup failed:', error);
    return null;
  }

  return data ? publicShop(data) : null;
}

router.post('/register', async (req, res) => {
  try {
    const { name, address, lat, lng, ownerEmail, password, upiId } = req.body;
    if (!name || !ownerEmail || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedEmail = ownerEmail.trim().toLowerCase();
    const { data: existingShop, error: existingError } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_email', normalizedEmail)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingShop) return res.status(400).json({ error: 'Shop owner already registered' });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message && authError.message.toLowerCase().includes('already')) {
        return res.status(400).json({ error: 'Shop owner already registered' });
      }
      throw authError;
    }

    const { data: shop, error: insertError } = await supabase
      .from('shops')
      .insert({
        auth_user_id: authData.user.id,
        name,
        address: address || '',
        lat: parseFloat(lat) || 17.4401,
        lng: parseFloat(lng) || 78.3489,
        status: 'closed',
        owner_email: normalizedEmail,
        upi_id: upiId || '',
      })
      .select('*')
      .single();

    if (insertError) throw insertError;

    res.json({ success: true, shop: publicShop(shop) });
  } catch (err) {
    console.error('Shop registration failed:', err);
    res.status(500).json({ error: 'Could not register shop' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { ownerEmail, password } = req.body;
    if (!ownerEmail || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const normalizedEmail = ownerEmail.trim().toLowerCase();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle();

    if (shopError) throw shopError;
    if (!shop) return res.status(404).json({ error: 'Shop profile not found' });

    res.json({ success: true, shop: publicShop(shop) });
  } catch (err) {
    console.error('Shop login failed:', err);
    res.status(500).json({ error: 'Could not log in' });
  }
});

router.post('/:shopId/status', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { status } = req.body;

    if (!['free', 'moderate', 'busy', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await supabase
      .from('shops')
      .update({ status })
      .eq('id', shopId)
      .select('status')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Shop not found' });

    res.json({ success: true, status: data.status });
  } catch (err) {
    console.error('Shop status update failed:', err);
    res.status(500).json({ error: 'Could not update shop status' });
  }
});

router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const targetLat = parseFloat(lat);
    const targetLng = parseFloat(lng);

    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    let nearbyShops = [...demoShops, ...(data || []).map(publicShop)].map((shop) => ({
      id: shop.id,
      name: shop.name,
      address: shop.address,
      location: shop.location,
      status: shop.status,
      upiId: shop.upiId,
    }));

    if (!isNaN(targetLat) && !isNaN(targetLng)) {
      nearbyShops.sort((a, b) => {
        const distA = Math.pow(a.location[0] - targetLat, 2) + Math.pow(a.location[1] - targetLng, 2);
        const distB = Math.pow(b.location[0] - targetLat, 2) + Math.pow(b.location[1] - targetLng, 2);
        return distA - distB;
      });
    }

    res.json({ shops: nearbyShops });
  } catch (err) {
    console.error('Nearby shop lookup failed:', err);
    res.status(500).json({ error: 'Could not load nearby shops' });
  }
});

router.getShop = getShop;

module.exports = router;
