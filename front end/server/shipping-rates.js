/**
 * GESTION DE LA GRILLE TARIFAIRE D'EXPÉDITION
 * 
 * Architecture SaaS B2B :
 * - Chaque client SaaS a sa propre grille tarifaire
 * - Zones, services, tranches de poids et tarifs configurables
 * - Isolation stricte par saasAccountId
 * - Versioning pour devis figés
 */

import { Timestamp, FieldValue } from "firebase-admin/firestore";

/**
 * ZONES PRÉ-CRÉÉES À L'INSCRIPTION
 */
const DEFAULT_SHIPPING_ZONES = [
  {
    name: "France Métropolitaine",
    code: "ZONE_FR",
    countries: ["FR"],
    isActive: true,
  },
  {
    name: "Europe Proche",
    code: "ZONE_EU_PROCHE",
    countries: ["BE", "LU", "DE", "NL", "ES", "IT"],
    isActive: true,
  },
  {
    name: "Europe Élargie",
    code: "ZONE_EU_LARGE",
    countries: ["PT", "AT", "DK", "IE", "SE", "FI", "PL", "CZ", "HU"],
    isActive: true,
  },
  {
    name: "Europe Éloignée",
    code: "ZONE_EU_FAR",
    countries: ["UK", "CH", "NO", "GR", "RO", "BG", "HR"],
    isActive: true,
  },
  {
    name: "Amérique du Nord",
    code: "ZONE_NA",
    countries: ["US", "CA", "MX"],
    isActive: true,
  },
  {
    name: "Asie",
    code: "ZONE_ASIA",
    countries: ["CN", "HK", "JP", "KR", "SG", "TH", "IN", "MY", "ID", "VN"],
    isActive: true,
  },
  {
    name: "Amérique du Sud",
    code: "ZONE_SA",
    countries: ["BR", "AR", "CL", "CO", "PE", "VE"],
    isActive: true,
  },
  {
    name: "Afrique",
    code: "ZONE_AF",
    countries: ["MA", "TN", "DZ", "SN", "CI", "EG", "ZA", "KE"],
    isActive: true,
  },
];

/**
 * SERVICES PRÉ-CRÉÉS À L'INSCRIPTION
 */
const DEFAULT_SHIPPING_SERVICES = [
  {
    name: "STANDARD",
    description: "Livraison standard (5-7 jours)",
    isActive: true,
    order: 1,
  },
  {
    name: "EXPRESS",
    description: "Livraison rapide (2-3 jours)",
    isActive: true,
    order: 2,
  },
];

/**
 * TRANCHES DE POIDS PRÉ-CRÉÉES À L'INSCRIPTION
 */
const DEFAULT_WEIGHT_BRACKETS = [
  { minWeight: 1, order: 1 },
  { minWeight: 2, order: 2 },
  { minWeight: 5, order: 3 },
  { minWeight: 10, order: 4 },
  { minWeight: 20, order: 5 },
  { minWeight: 30, order: 6 },
  { minWeight: 40, order: 7 },
];

/**
 * INITIALISER LA GRILLE TARIFAIRE POUR UN NOUVEAU CLIENT SAAS
 * 
 * Appelé lors de la création d'un compte SaaS
 */
export async function initializeShippingRates(firestore, saasAccountId) {
  try {
    console.log(`[ShippingRates] 🚀 Initialisation grille tarifaire pour ${saasAccountId}`);

    const batch = firestore.batch();
    const now = Timestamp.now();

    // 1. Créer les zones
    const zoneIds = [];
    for (const zone of DEFAULT_SHIPPING_ZONES) {
      const zoneRef = firestore.collection("shippingZones").doc();
      batch.set(zoneRef, {
        ...zone,
        saasAccountId,
        createdAt: now,
        updatedAt: now,
      });
      zoneIds.push(zoneRef.id);
    }

    // 2. Créer les services
    const serviceIds = [];
    for (const service of DEFAULT_SHIPPING_SERVICES) {
      const serviceRef = firestore.collection("shippingServices").doc();
      batch.set(serviceRef, {
        ...service,
        saasAccountId,
        createdAt: now,
        updatedAt: now,
      });
      serviceIds.push(serviceRef.id);
    }

    // 3. Créer les tranches de poids
    const weightBracketIds = [];
    for (const bracket of DEFAULT_WEIGHT_BRACKETS) {
      const bracketRef = firestore.collection("weightBrackets").doc();
      batch.set(bracketRef, {
        ...bracket,
        saasAccountId,
        createdAt: now,
        updatedAt: now,
      });
      weightBracketIds.push(bracketRef.id);
    }

    // 4. Créer les paramètres par défaut
    const settingsRef = firestore.collection("shippingSettings").doc(saasAccountId);
    batch.set(settingsRef, {
      saasAccountId,
      overweightPolicy: "FLAT_FEE",
      overweightFlatFee: 180,
      overweightMessage: "Poids supérieur aux tranches standards",
      createdAt: now,
      updatedAt: now,
    });

    // 5. Commit le batch
    await batch.commit();

    console.log(`[ShippingRates] ✅ Grille tarifaire initialisée: ${zoneIds.length} zones, ${serviceIds.length} services, ${weightBracketIds.length} tranches`);

    return {
      zoneIds,
      serviceIds,
      weightBracketIds,
    };
  } catch (error) {
    console.error(`[ShippingRates] ❌ Erreur initialisation:`, error);
    throw error;
  }
}

/**
 * GET /api/shipping/zones
 * Récupérer toutes les zones d'un compte SaaS
 */
export async function handleGetZones(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;

    const snapshot = await firestore
      .collection("shippingZones")
      .where("saasAccountId", "==", saasAccountId)
      .orderBy("name", "asc")
      .get();

    const zones = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(zones);
  } catch (error) {
    console.error("[ShippingRates] Erreur GET zones:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/shipping/zones
 * Créer une nouvelle zone
 */
export async function handleCreateZone(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { name, code, countries, isActive = true } = req.body;

    if (!name || !code || !countries || countries.length === 0) {
      return res.status(400).json({ error: "Champs requis: name, code, countries" });
    }

    const zoneRef = firestore.collection("shippingZones").doc();
    await zoneRef.set({
      saasAccountId,
      name,
      code,
      countries,
      isActive,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const zone = await zoneRef.get();
    return res.json({ id: zone.id, ...zone.data() });
  } catch (error) {
    console.error("[ShippingRates] Erreur CREATE zone:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/shipping/zones/:id
 * Mettre à jour une zone
 */
export async function handleUpdateZone(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { id } = req.params;
    const { name, code, countries, isActive } = req.body;

    const zoneRef = firestore.collection("shippingZones").doc(id);
    const zoneDoc = await zoneRef.get();

    if (!zoneDoc.exists) {
      return res.status(404).json({ error: "Zone non trouvée" });
    }

    if (zoneDoc.data().saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    const updateData = {
      updatedAt: Timestamp.now(),
    };

    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (countries !== undefined) updateData.countries = countries;
    if (isActive !== undefined) updateData.isActive = isActive;

    await zoneRef.update(updateData);

    const updatedZone = await zoneRef.get();
    return res.json({ id: updatedZone.id, ...updatedZone.data() });
  } catch (error) {
    console.error("[ShippingRates] Erreur UPDATE zone:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/shipping/zones/:id
 * Supprimer une zone (soft delete)
 */
export async function handleDeleteZone(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { id } = req.params;

    const zoneRef = firestore.collection("shippingZones").doc(id);
    const zoneDoc = await zoneRef.get();

    if (!zoneDoc.exists) {
      return res.status(404).json({ error: "Zone non trouvée" });
    }

    if (zoneDoc.data().saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    // Soft delete
    await zoneRef.update({
      isActive: false,
      updatedAt: Timestamp.now(),
    });

    return res.json({ success: true, message: "Zone désactivée" });
  } catch (error) {
    console.error("[ShippingRates] Erreur DELETE zone:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/shipping/services
 * Récupérer tous les services d'un compte SaaS
 */
export async function handleGetServices(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;

    const snapshot = await firestore
      .collection("shippingServices")
      .where("saasAccountId", "==", saasAccountId)
      .orderBy("order", "asc")
      .get();

    const services = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(services);
  } catch (error) {
    console.error("[ShippingRates] Erreur GET services:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/shipping/services
 * Créer un nouveau service
 */
export async function handleCreateService(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { name, description, isActive = true, order } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Champ requis: name" });
    }

    const serviceRef = firestore.collection("shippingServices").doc();
    await serviceRef.set({
      saasAccountId,
      name,
      description: description || null,
      isActive,
      order: order || 999,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const service = await serviceRef.get();
    return res.json({ id: service.id, ...service.data() });
  } catch (error) {
    console.error("[ShippingRates] Erreur CREATE service:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/shipping/services/:id
 * Mettre à jour un service
 */
export async function handleUpdateService(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { id } = req.params;
    const { name, description, isActive, order } = req.body;

    const serviceRef = firestore.collection("shippingServices").doc(id);
    const serviceDoc = await serviceRef.get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: "Service non trouvé" });
    }

    if (serviceDoc.data().saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    const updateData = {
      updatedAt: Timestamp.now(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (order !== undefined) updateData.order = order;

    await serviceRef.update(updateData);

    const updatedService = await serviceRef.get();
    return res.json({ id: updatedService.id, ...updatedService.data() });
  } catch (error) {
    console.error("[ShippingRates] Erreur UPDATE service:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/shipping/services/:id
 * Supprimer un service (soft delete)
 */
export async function handleDeleteService(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { id } = req.params;

    const serviceRef = firestore.collection("shippingServices").doc(id);
    const serviceDoc = await serviceRef.get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: "Service non trouvé" });
    }

    if (serviceDoc.data().saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    // Soft delete
    await serviceRef.update({
      isActive: false,
      updatedAt: Timestamp.now(),
    });

    return res.json({ success: true, message: "Service désactivé" });
  } catch (error) {
    console.error("[ShippingRates] Erreur DELETE service:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/shipping/weight-brackets
 * Récupérer toutes les tranches de poids d'un compte SaaS
 */
export async function handleGetWeightBrackets(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;

    const snapshot = await firestore
      .collection("weightBrackets")
      .where("saasAccountId", "==", saasAccountId)
      .orderBy("order", "asc")
      .get();

    const brackets = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(brackets);
  } catch (error) {
    console.error("[ShippingRates] Erreur GET weight brackets:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/shipping/weight-brackets
 * Créer une nouvelle tranche de poids
 */
export async function handleCreateWeightBracket(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { minWeight, order } = req.body;

    if (!minWeight || minWeight <= 0) {
      return res.status(400).json({ error: "minWeight requis et > 0" });
    }

    const bracketRef = firestore.collection("weightBrackets").doc();
    await bracketRef.set({
      saasAccountId,
      minWeight,
      order: order || 999,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const bracket = await bracketRef.get();
    return res.json({ id: bracket.id, ...bracket.data() });
  } catch (error) {
    console.error("[ShippingRates] Erreur CREATE weight bracket:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/shipping/weight-brackets/:id
 * Mettre à jour une tranche de poids
 */
export async function handleUpdateWeightBracket(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { id } = req.params;
    const { minWeight, order } = req.body;

    const bracketRef = firestore.collection("weightBrackets").doc(id);
    const bracketDoc = await bracketRef.get();

    if (!bracketDoc.exists) {
      return res.status(404).json({ error: "Tranche de poids non trouvée" });
    }

    if (bracketDoc.data().saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    const updateData = {
      updatedAt: Timestamp.now(),
    };

    if (minWeight !== undefined) updateData.minWeight = minWeight;
    if (order !== undefined) updateData.order = order;

    await bracketRef.update(updateData);

    const updatedBracket = await bracketRef.get();
    return res.json({ id: updatedBracket.id, ...updatedBracket.data() });
  } catch (error) {
    console.error("[ShippingRates] Erreur UPDATE weight bracket:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * DELETE /api/shipping/weight-brackets/:id
 * Supprimer une tranche de poids
 */
export async function handleDeleteWeightBracket(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { id } = req.params;

    const bracketRef = firestore.collection("weightBrackets").doc(id);
    const bracketDoc = await bracketRef.get();

    if (!bracketDoc.exists) {
      return res.status(404).json({ error: "Tranche de poids non trouvée" });
    }

    if (bracketDoc.data().saasAccountId !== saasAccountId) {
      return res.status(403).json({ error: "Accès interdit" });
    }

    // Hard delete (car pas de dépendances critiques)
    await bracketRef.delete();

    return res.json({ success: true, message: "Tranche de poids supprimée" });
  } catch (error) {
    console.error("[ShippingRates] Erreur DELETE weight bracket:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/shipping/rates
 * Récupérer tous les tarifs d'un compte SaaS
 */
export async function handleGetRates(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;

    const snapshot = await firestore
      .collection("shippingRates")
      .where("saasAccountId", "==", saasAccountId)
      .get();

    const rates = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.json(rates);
  } catch (error) {
    console.error("[ShippingRates] Erreur GET rates:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/shipping/rates
 * Créer ou mettre à jour un tarif
 */
export async function handleUpsertRate(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { zoneId, serviceId, weightBracketId, price } = req.body;

    if (!zoneId || !serviceId || !weightBracketId) {
      return res.status(400).json({ error: "Champs requis: zoneId, serviceId, weightBracketId" });
    }

    // Vérifier que la combinaison existe déjà
    const existingSnapshot = await firestore
      .collection("shippingRates")
      .where("saasAccountId", "==", saasAccountId)
      .where("zoneId", "==", zoneId)
      .where("serviceId", "==", serviceId)
      .where("weightBracketId", "==", weightBracketId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      // Update
      const rateDoc = existingSnapshot.docs[0];
      await rateDoc.ref.update({
        price: price === null || price === undefined ? null : parseFloat(price),
        updatedAt: Timestamp.now(),
      });

      const updatedRate = await rateDoc.ref.get();
      return res.json({ id: updatedRate.id, ...updatedRate.data() });
    } else {
      // Create
      const rateRef = firestore.collection("shippingRates").doc();
      await rateRef.set({
        saasAccountId,
        zoneId,
        serviceId,
        weightBracketId,
        price: price === null || price === undefined ? null : parseFloat(price),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const rate = await rateRef.get();
      return res.json({ id: rate.id, ...rate.data() });
    }
  } catch (error) {
    console.error("[ShippingRates] Erreur UPSERT rate:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/shipping/settings
 * Récupérer les paramètres d'expédition d'un compte SaaS
 */
export async function handleGetSettings(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;

    const settingsDoc = await firestore
      .collection("shippingSettings")
      .doc(saasAccountId)
      .get();

    if (!settingsDoc.exists) {
      // Créer les paramètres par défaut
      await firestore.collection("shippingSettings").doc(saasAccountId).set({
        saasAccountId,
        overweightPolicy: "FLAT_FEE",
        overweightFlatFee: 180,
        overweightMessage: "Poids supérieur aux tranches standards",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const newSettings = await firestore.collection("shippingSettings").doc(saasAccountId).get();
      return res.json(newSettings.data());
    }

    return res.json(settingsDoc.data());
  } catch (error) {
    console.error("[ShippingRates] Erreur GET settings:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * PUT /api/shipping/settings
 * Mettre à jour les paramètres d'expédition
 */
export async function handleUpdateSettings(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;
    const { overweightPolicy, overweightFlatFee, overweightMessage, defaultServiceId } = req.body;

    const settingsRef = firestore.collection("shippingSettings").doc(saasAccountId);
    const settingsDoc = await settingsRef.get();

    const updateData = {
      updatedAt: Timestamp.now(),
    };

    if (overweightPolicy !== undefined) updateData.overweightPolicy = overweightPolicy;
    if (overweightFlatFee !== undefined) updateData.overweightFlatFee = overweightFlatFee;
    if (overweightMessage !== undefined) updateData.overweightMessage = overweightMessage;
    if (defaultServiceId !== undefined) updateData.defaultServiceId = defaultServiceId;

    if (!settingsDoc.exists) {
      // Créer
      await settingsRef.set({
        saasAccountId,
        ...updateData,
        createdAt: Timestamp.now(),
      });
    } else {
      // Update
      await settingsRef.update(updateData);
    }

    const updatedSettings = await settingsRef.get();
    return res.json(updatedSettings.data());
  } catch (error) {
    console.error("[ShippingRates] Erreur UPDATE settings:", error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/shipping/grid
 * Récupérer toutes les données de la grille (zones + services + tranches + tarifs + settings)
 */
export async function handleGetGrid(req, res, firestore) {
  try {
    const saasAccountId = req.saasAccountId;

    // Récupérer toutes les données en parallèle
    const [zonesSnapshot, servicesSnapshot, bracketsSnapshot, ratesSnapshot, settingsDoc] = await Promise.all([
      firestore.collection("shippingZones").where("saasAccountId", "==", saasAccountId).orderBy("name", "asc").get(),
      firestore.collection("shippingServices").where("saasAccountId", "==", saasAccountId).orderBy("order", "asc").get(),
      firestore.collection("weightBrackets").where("saasAccountId", "==", saasAccountId).orderBy("order", "asc").get(),
      firestore.collection("shippingRates").where("saasAccountId", "==", saasAccountId).get(),
      firestore.collection("shippingSettings").doc(saasAccountId).get(),
    ]);

    const zones = zonesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const services = servicesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const weightBrackets = bracketsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const rates = ratesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const settings = settingsDoc.exists ? settingsDoc.data() : null;

    return res.json({
      zones,
      services,
      weightBrackets,
      rates,
      settings,
    });
  } catch (error) {
    console.error("[ShippingRates] Erreur GET grid:", error);
    return res.status(500).json({ error: error.message });
  }
}

