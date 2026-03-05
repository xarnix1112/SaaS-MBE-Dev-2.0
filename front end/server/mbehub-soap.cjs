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
 * Appel ShipmentRequest avec IsDraft=true - crée une expédition en brouillon
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.password
 * @param {string} params.env
 * @param {Object} params.recipient - { name, companyName, address, address2, city, zipCode, state, country, email, phone }
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

  const args = {
    RequestContainer: {
      System: { Value: 'NEW' },
      Credentials: { Username: username, Passphrase: password },
      InternalReferenceID: `MBE-SDV-${Date.now()}-${reference || 'draft'}`,
      Recipient: recipientData,
      Shipment: shipmentData,
    },
  };

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

module.exports = {
  getShippingOptions,
  createDraftShipment,
};
