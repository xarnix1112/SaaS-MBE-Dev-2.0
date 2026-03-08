/**
 * Service MBE eShip SOAP - Intégration API pour création d'expéditions en brouillon
 * Documentation: https://sites.google.com/fortidia.com/eship-api-documentation/
 * Auth: HTTP Basic (username:password)
 * Fichier .cjs pour compatibilité avec "type": "module" du projet
 */

const soap = require('soap');

const WSDL_URLS = {
  demo: 'https://api.demo.mbehub.it/ws/e-link.wsdl',
  prod: 'https://api.mbeonline.fr/ws/e-link.wsdl',
};

const WSDL_BASE = {
  demo: 'https://api.demo.mbehub.it/ws',
  prod: 'https://api.mbeonline.fr/ws',
};

/**
 * Crée un client SOAP avec authentification Basic
 * @param {string} env - 'demo' | 'prod'
 * @param {string} username
 * @param {string} password
 * @returns {Promise<soap.Client>}
 */
async function createMbeSoapClient(env, username, password) {
  const wsdlUrl = WSDL_URLS[env] || WSDL_URLS.demo;
  const baseUrl = WSDL_BASE[env] || WSDL_BASE.demo;

  return new Promise((resolve, reject) => {
    soap.createClient(wsdlUrl, { endpoint: baseUrl }, (err, client) => {
      if (err) return reject(err);

      // HTTP Basic Auth (doc: Credentials node deprecated, use Authorization header)
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      client.setSecurity(new soap.BasicAuthSecurity(username, password));

      resolve(client);
    });
  });
}

/**
 * Appel ShippingOptionsRequest - récupère les services disponibles
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.env - 'demo' | 'prod'
 * @param {Object} params.destination - { zipCode, city, state, country }
 * @param {number} params.weight - kg
 * @param {Object} params.dimensions - { length, width, height } en cm
 * @param {boolean} [params.insurance]
 * @param {number} [params.insuranceValue]
 * @returns {Promise<Array<{Service, ServiceDesc, Courier, GrossShipmentPrice, ...}>>}
 */
async function getShippingOptions({ username, password, env, destination, weight, dimensions, insurance = false, insuranceValue = 0 }) {
  const client = await createMbeSoapClient(env, username, password);

  const destinationInfo = {
    ZipCode: String(destination.zipCode || '').trim().slice(0, 12),
    City: String(destination.city || '').trim().slice(0, 100),
    State: String(destination.state || '').trim().slice(0, 2),
    Country: String(destination.country || '').trim().slice(0, 2).toUpperCase(),
  };

  // WSDL DimensionsType utilise "Lenght" (typo API) au lieu de "Length", ordre: Lenght, Height, Width
  const items = {
    Item: {
      Weight: Number(weight) || 1,
      Dimensions: {
        Lenght: Number(dimensions?.length) || 10,
        Height: Number(dimensions?.height) || 10,
        Width: Number(dimensions?.width) || 10,
      },
    },
  };

  const shippingParams = {
    DestinationInfo: destinationInfo,
    ShipType: 'IMPORT',
    PackageType: 'GENERIC',
    GoodType: 'GOODS', // Doc: GOODS/ART/LUGGAGE
    Items: items,
    Insurance: !!insurance,
    ...(insurance && insuranceValue > 0 ? { InsuranceValue: insuranceValue } : {}),
  };

  const args = {
    RequestContainer: {
      System: { Value: 'NEW' },
      Credentials: { Username: username, Passphrase: password },
      InternalReferenceID: `MBE-SDV-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      ShippingParameters: shippingParams,
    },
  };

  return new Promise((resolve, reject) => {
    client.ShippingOptionsRequest(args, (err, result) => {
      if (err) return reject(err);

      const container = result?.RequestContainer;
      if (!container) return reject(new Error('Réponse MBE invalide'));

      if (container.Status === 'ERROR') {
        const errMsg = container.Errors?.Error
          ? (Array.isArray(container.Errors.Error) ? container.Errors.Error : [container.Errors.Error])
            .map((e) => e.ErrorMessage || e.ErrorCode || JSON.stringify(e))
            .join('; ')
          : 'Erreur MBE non détaillée';
        return reject(new Error(errMsg));
      }

      const options = container.ShippingOptions?.ShippingOption;
      if (!options) return resolve([]);

      const list = Array.isArray(options) ? options : [options];
      resolve(list.map((opt) => ({
        Service: opt.Service,
        ServiceDesc: opt.ServiceDesc,
        Courier: opt.Courier,
        CourierDesc: opt.CourierDesc,
        CourierService: opt.CourierService,
        CourierServiceDesc: opt.CourierServiceDesc,
        CourierAccount: opt.CourierAccount,
        GrossShipmentPrice: opt.GrossShipmentPrice,
        NetShipmentPrice: opt.NetShipmentPrice,
      })));
    });
  });
}

/**
 * Appel GetPickupAddressesRequest - récupère les adresses de collecte/expéditeur du centre MBE
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.env - 'demo' | 'prod'
 * @returns {Promise<Array<{TradeName, Address1, Address2, ZipCode, City, Province, Country, Phone1, Email1, IsDefault}>>}
 */
async function getPickupAddresses({ username, password, env }) {
  const client = await createMbeSoapClient(env, username, password);

  const args = {
    RequestContainer: {
      System: { Value: 'NEW' },
      Credentials: { Username: username, Passphrase: password },
      InternalReferenceID: `MBE-SDV-pickup-${Date.now()}`,
    },
  };

  return new Promise((resolve, reject) => {
    client.GetPickupAddressesRequest(args, (err, result) => {
      if (err) return reject(err);

      const container = result?.RequestContainer;
      if (!container) return reject(new Error('Réponse MBE invalide'));

      if (container.Status === 'ERROR') {
        const errMsg = container.Errors?.Error
          ? (Array.isArray(container.Errors.Error) ? container.Errors.Error : [container.Errors.Error])
            .map((e) => e.ErrorMessage || e.ErrorCode || JSON.stringify(e))
            .join('; ')
          : 'Erreur MBE non détaillée';
        return reject(new Error(errMsg));
      }

      const addrs = container.PickupAddress || [];
      const list = Array.isArray(addrs) ? addrs : (addrs ? [addrs] : []);
      const mapped = list.map((pa) => {
        const pc = pa.PickupContainer || pa;
        return {
          TradeName: pc.TradeName || '',
          Address1: pc.Address1 || '',
          Address2: pc.Address2 || '',
          Address3: pc.Address3 || '',
          ZipCode: pc.ZipCode || '',
          City: pc.City || '',
          Province: pc.Province || '',
          Country: pc.Country || '',
          Reference: pc.Reference || '',
          Phone1: pc.Phone1 || '',
          Email1: pc.Email1 || '',
          IsDefault: pc.IsDefault === true || pc.IsDefault === 'true',
        };
      });
      resolve(mapped);
    });
  });
}

/**
 * Parse une adresse string en composants pour CreateCustomerRequest
 * @param {string} raw - adresse brute (ex: "10 rue Example, 75001 Paris, France")
 * @returns {{ street: string, zip: string, city: string, province: string, country: string }}
 */
function parseClientAddress(raw) {
  const s = (raw || '').trim();
  if (!s) return { street: '', zip: '', city: '', province: 'XX', country: 'FR' };

  const countryMap = { france: 'FR', italie: 'IT', italia: 'IT', allemagne: 'DE', espagne: 'ES', portugal: 'PT', belgique: 'BE', suisse: 'CH', 'pays-bas': 'NL', luxembourg: 'LU', uk: 'GB', 'royaume-uni': 'GB' };
  let country = '';
  const twoLetter = s.match(/\b([A-Z]{2})\s*$/i);
  if (twoLetter) country = twoLetter[1].toUpperCase();
  else {
    const lower = s.toLowerCase();
    for (const [name, code] of Object.entries(countryMap)) {
      if (lower.includes(name)) { country = code; break; }
    }
  }
  if (!country) country = 'FR';

  const zipMatch = s.match(/\b(\d{5})\b/);
  const zip = zipMatch ? zipMatch[1] : '';
  const province = zip && zip.length >= 2 ? zip.slice(0, 2) : 'XX';

  let city = '';
  let street = s;
  if (zipMatch) {
    const afterZip = s.substring(zipMatch.index + zipMatch[0].length).trim();
    const cityMatch = afterZip.match(/^[\s,]*([A-Za-zÀ-ÿ\s\-']+?)(?:\s*,\s*|\s*$)/);
    if (cityMatch) city = cityMatch[1].trim();
    street = s.substring(0, zipMatch.index).trim().replace(/,+\s*$/, '').trim();
  }

  return { street: street || s, zip, city: city || '', province, country };
}

/**
 * Appel CreateCustomerRequest - crée ou met à jour un client MBE (CustomerSource=AH)
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.env - 'demo' | 'prod'
 * @param {Object} params.client - { name, address, email, phone }
 * @param {string} [params.auctionHouseMbeId] - ID salle des ventes pour CustomerSourceInternalReference
 * @returns {Promise<{customerMbeId: string, status: 'CREATED'|'UPDATED'}>}
 */
async function createCustomerRequest({ username, password, env, client, auctionHouseMbeId }) {
  const soapClient = await createMbeSoapClient(env, username, password);

  const parts = (client.name || 'Client').trim().split(/\s+/);
  const firstName = parts.length > 1 ? parts[0] : '-';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] || 'Client');
  const parsed = parseClientAddress(client.address || '');

  const customerData = {
    CustomerSource: 'AH',
    CustomerType: 'OCCASIONAL',
    B2B: false,
    TradingName: String(client.name || 'Client').slice(0, 100),
    FirstName: String(firstName).slice(0, 50),
    LastName: String(lastName).slice(0, 50),
    Address1: String(parsed.street || 'N/A').slice(0, 200),
    ZipCode: String(parsed.zip || '00000').slice(0, 12),
    City: String(parsed.city || 'N/A').slice(0, 100),
    Province: String(parsed.province || 'XX').slice(0, 2),
    Country: String(parsed.country || 'FR').slice(0, 2).toUpperCase(),
    Phone: String(client.phone || '-').slice(0, 50),
    Email: String(client.email || 'noreply@example.com').slice(0, 100),
  };
  if (auctionHouseMbeId && String(auctionHouseMbeId).trim()) {
    customerData.CustomerSourceInternalReference = String(auctionHouseMbeId).trim();
  }

  const args = {
    RequestContainer: {
      System: { Value: 'NEW' },
      Credentials: { Username: username, Passphrase: password },
      InternalReferenceID: `MBE-SDV-createcust-${Date.now()}`,
      Customer: customerData,
      PrivacyPolicyAcknowledgement: 'TRUE',
      ConsentMktCenter: 'FALSE',
      ConsentMktCorporate: 'FALSE',
      ConsentProfiling: 'FALSE',
      ConsentThirdParty: 'FALSE',
    },
  };

  return new Promise((resolve, reject) => {
    soapClient.CreateCustomerRequest(args, (err, result) => {
      if (err) return reject(err);

      const container = result?.RequestContainer;
      if (!container) return reject(new Error('Réponse MBE invalide'));

      if (container.Status === 'ERROR') {
        const errList = container.Errors?.Error
          ? (Array.isArray(container.Errors.Error) ? container.Errors.Error : [container.Errors.Error])
          : [];
        const errMsg = errList.length > 0
          ? errList
              .map((e) => e.ErrorMessage || e.Description || e.ErrorCode || JSON.stringify(e))
              .join('; ')
          : 'Erreur MBE non détaillée';
        return reject(new Error(errMsg));
      }

      const customerMbeId = container.CustomerMBEID || '';
      const status = (container.CustomerStatus || 'CREATED').toUpperCase();
      resolve({ customerMbeId, status: status === 'UPDATED' ? 'UPDATED' : 'CREATED' });
    });
  });
}

/**
 * Appel ShipmentRequest avec IsDraft=true - crée une expédition en brouillon
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.env
 * @param {Object} params.recipient - { name, companyName, address, address2, city, zipCode, state, country, email, phone }
 * @param {Object} [params.sender] - expéditeur (MBE Hub PickupAddress) - si fourni, remplit la zone Expéditeur
 * @param {string} [params.customerMbeId] - ID client MBE "Salle - Expéditions clients" - remplit la zone Client
 * @param {string} params.service - ID service depuis ShippingOptionsRequest
 * @param {string} params.courierService
 * @param {string} params.courierAccount
 * @param {number} params.weight - kg
 * @param {Object} params.dimensions - { length, width, height } cm
 * @param {string} params.reference - référence devis
 * @param {boolean} [params.insurance]
 * @param {number} [params.insuranceValue]
 * @returns {Promise<{mbeTrackingId: string, status: string}>}
 */
async function createDraftShipment({
  username,
  password,
  env,
  recipient,
  sender,
  customerMbeId,
  service,
  courierService,
  courierAccount,
  weight,
  dimensions,
  reference,
  insurance = false,
  insuranceValue = 0,
}) {
  const client = await createMbeSoapClient(env, username, password);

  const recipientData = {
    Name: String(recipient.name || 'Client').slice(0, 100),
    CompanyName: String(recipient.companyName || recipient.name || '').trim().slice(0, 100) || undefined,
    Address: String(recipient.address || '').slice(0, 200),
    Address2: String(recipient.address2 || '').trim().slice(0, 100) || undefined,
    City: String(recipient.city || '').slice(0, 100),
    ZipCode: String(recipient.zipCode || '').slice(0, 12),
    State: (String(recipient.state || '').trim().slice(0, 2) || undefined),
    Country: String(recipient.country || '').slice(0, 2).toUpperCase(),
    Email: String(recipient.email || '').trim().slice(0, 100) || undefined,
    Phone: String(recipient.phone || '').trim().slice(0, 50) || undefined,
  };
  if (recipientData.CompanyName === undefined) delete recipientData.CompanyName;
  if (recipientData.Address2 === undefined || recipientData.Address2 === '') delete recipientData.Address2;
  if (recipientData.State === undefined || recipientData.State === '') delete recipientData.State;
  if (recipientData.Email === undefined || recipientData.Email === '') delete recipientData.Email;
  if (recipientData.Phone === undefined || recipientData.Phone === '') delete recipientData.Phone;

  // Sender (Expéditeur) - depuis GetPickupAddresses, format RecipientType
  let senderData = null;
  if (sender && (sender.TradeName || sender.Address1)) {
    const name = String(sender.TradeName || sender.Address1 || 'MBE').slice(0, 100);
    senderData = {
      Name: name,
      CompanyName: name,
      Address: String(sender.Address1 || '').slice(0, 200),
      Address2: sender.Address2 ? String(sender.Address2).trim().slice(0, 100) : undefined,
      City: String(sender.City || '').slice(0, 100),
      ZipCode: String(sender.ZipCode || '').slice(0, 12),
      State: sender.Province ? String(sender.Province).trim().slice(0, 2) : undefined,
      Country: String(sender.Country || 'FR').slice(0, 2).toUpperCase(),
      Email: sender.Email1 ? String(sender.Email1).trim().slice(0, 100) : undefined,
      Phone: sender.Phone1 ? String(sender.Phone1).trim().slice(0, 50) : undefined,
    };
    if (!senderData.Address2) delete senderData.Address2;
    if (!senderData.State) delete senderData.State;
    if (!senderData.Email) delete senderData.Email;
    if (!senderData.Phone) delete senderData.Phone;
  }

  // WSDL DimensionsType utilise "Lenght" (typo API) au lieu de "Length", ordre: Lenght, Height, Width
  const items = {
    Item: {
      Weight: Number(weight) || 1,
      Dimensions: {
        Lenght: Math.max(1, Number(dimensions?.length) || 10),
        Height: Math.max(1, Number(dimensions?.height) || 10),
        Width: Math.max(1, Number(dimensions?.width) || 10),
      },
    },
  };

  // IsDraft doit être dans Shipment (WSDL ShipmentType), pas dans RequestContainer
  const shipmentData = {
    ShipperType: 'MBE',
    Description: String(reference || 'Expédition').slice(0, 100),
    COD: false,
    Insurance: !!insurance,
    ...(insurance && insuranceValue > 0 ? { InsuranceValue: insuranceValue } : {}),
    Service: service,
    ...(courierService && String(courierService).trim() ? { CourierService: String(courierService).trim() } : {}),
    ...(courierAccount && String(courierAccount).trim() ? { CourierAccount: String(courierAccount).trim() } : {}),
    PackageType: 'GENERIC',
    GoodType: 'GOODS', // Doc: GOODS/ART/LUGGAGE
    Items: items,
    IsDraft: true, // Brouillon → apparaît dans "En attente" du Hub MBE, pas dans "Historique"
  };

  const requestContainer = {
    System: { Value: 'NEW' },
    Credentials: { Username: username, Passphrase: password },
    InternalReferenceID: `MBE-SDV-${Date.now()}-${reference || 'draft'}`,
    Recipient: recipientData,
    Shipment: shipmentData,
  };
  if (customerMbeId && String(customerMbeId).trim()) {
    requestContainer.CustomerMbeId = String(customerMbeId).trim();
  }
  if (senderData) {
    requestContainer.Sender = senderData;
  }
  const args = { RequestContainer: requestContainer };

  return new Promise((resolve, reject) => {
    client.ShipmentRequest(args, (err, result) => {
      if (err) return reject(err);

      const container = result?.RequestContainer;
      if (!container) return reject(new Error('Réponse MBE invalide'));

      if (container.Status === 'ERROR') {
        const errList = container.Errors?.Error
          ? (Array.isArray(container.Errors.Error) ? container.Errors.Error : [container.Errors.Error])
          : [];
        const errMsg = errList.length > 0
          ? errList
              .map((e) => {
                const code = e.ErrorCode || '';
                const msg = e.ErrorMessage || e.Description || '';
                return code && msg ? `${code}: ${msg}` : msg || code || JSON.stringify(e);
              })
              .join('; ')
          : 'Erreur MBE non détaillée';
        console.error('[mbehub-soap] ShipmentRequest ERROR:', JSON.stringify(container.Errors));
        return reject(new Error(errMsg));
      }

      const mbeTrackingId = container.MasterTrackingMBE || container.SystemReferenceID || '';
      resolve({
        mbeTrackingId,
        status: container.Status,
      });
    });
  });
}

/**
 * Appel CloseShipmentsRequest - transfère l'expédition brouillon vers Interface B (Centre MBE, zone "En attente")
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.env - 'demo' | 'prod'
 * @param {string|string[]} params.masterTrackingsMBE - ID(s) retourné(s) par ShipmentRequest (MasterTrackingMBE)
 * @returns {Promise<{status: string}>}
 */
async function closeShipments({ username, password, env, masterTrackingsMBE }) {
  const client = await createMbeSoapClient(env, username, password);
  const ids = Array.isArray(masterTrackingsMBE) ? masterTrackingsMBE : [masterTrackingsMBE].filter(Boolean);
  if (ids.length === 0) return Promise.reject(new Error('MasterTrackingsMBE requis'));

  const args = {
    RequestContainer: {
      SystemType: 'IT', // Doc: défini par l'URL d'appel, valeur conservée pour compatibilité
      Credentials: { Username: username, Passphrase: password },
      InternalReferenceID: `MBE-SDV-close-${Date.now()}`,
      MasterTrackingsMBE: ids,
    },
  };

  return new Promise((resolve, reject) => {
    client.CloseShipmentsRequest(args, (err, result) => {
      if (err) return reject(err);

      const container = result?.RequestContainer;
      if (!container) return reject(new Error('Réponse MBE invalide'));

      if (container.Status === 'ERROR') {
        const errList = container.Errors?.Error
          ? (Array.isArray(container.Errors.Error) ? container.Errors.Error : [container.Errors.Error])
          : [];
        const errMsg = errList.length > 0
          ? errList
              .map((e) => {
                const code = e.ErrorCode || '';
                const msg = e.ErrorMessage || e.Description || '';
                return code && msg ? `${code}: ${msg}` : msg || code || JSON.stringify(e);
              })
              .join('; ')
          : 'Erreur MBE non détaillée';
        console.error('[mbehub-soap] CloseShipmentsRequest ERROR:', JSON.stringify(container.Errors));
        return reject(new Error(errMsg));
      }

      resolve({ status: container.Status });
    });
  });
}

module.exports = {
  getShippingOptions,
  getPickupAddresses,
  createCustomerRequest,
  parseClientAddress,
  createDraftShipment,
  closeShipments,
};
