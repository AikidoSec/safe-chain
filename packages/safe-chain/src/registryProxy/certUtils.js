import forge from "node-forge";
import path from "path";
import fs from "fs";
import os from "os";

const certFolder = path.join(os.homedir(), ".safe-chain", "certs");
/** @type {null | {certificate: any, privateKey: any}} */
let ca = null;

/**
 * Get the CA certificate, loading it lazily on first access.
 * @returns {{certificate: any, privateKey: any}}
 */
function getCa() {
  if (!ca) {
    ca = loadCa();
  }
  return ca;
}

const certCache = new Map();

/**
 * @param {forge.pki.PublicKey} publicKey
 * @returns {string}
 */
function createKeyIdentifier(publicKey) {
  return forge.pki.getPublicKeyFingerprint(publicKey, {
    encoding: "binary",
    md: forge.md.sha1.create(),
  });
}

export function getCaCertPath() {
  // Ensure CA is loaded and files are written when cert path is requested
  getCa();
  const certPath = path.join(certFolder, "ca-cert.pem");
  
  // Ensure the file exists (in case lazy loading just happened)
  if (!fs.existsSync(certPath)) {
    throw new Error(`CA certificate file not found at ${certPath}. This should not happen.`);
  }
  
  return certPath;
}

/**
 * @param {string} hostname
 * @returns {{privateKey: string, certificate: string}}
 */
export function generateCertForHost(hostname) {
  let existingCert = certCache.get(hostname);
  if (existingCert) {
    return existingCert;
  }

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setHours(cert.validity.notBefore.getHours() + 1);

  const attrs = [{ name: "commonName", value: hostname }];
  cert.setSubject(attrs);
  
  const certAuthority = getCa();
  cert.setIssuer(certAuthority.certificate.subject.attributes);
  const authorityKeyIdentifier = createKeyIdentifier(certAuthority.certificate.publicKey);
  cert.setExtensions([
    {
      name: "subjectAltName",
      altNames: [
        {
          type: 2, // DNS
          value: hostname,
        },
      ],
    },
    {
      name: "keyUsage",
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      /*
        Extended Key Usage (EKU) serverAuth extension

        Needed for TLS server authentication. This extension indicates the certificate's
        public key may be used for TLS WWW server authentication.
        Python virtualenv environments (like pipx-installed Poetry) enforce this strictly
        https://www.rfc-editor.org/rfc/rfc5280#section-4.2.1.12
      */
      name: "extKeyUsage",
      serverAuth: true,
    },
    {
      /*
        Subject Key Identifier (SKI)
        
        Needed for Python virtualenv SSL validation and certificate chain building.
        This extension provides a means of identifying certificates containing a particular public key.
        Python virtualenv environments require this for proper certificate chain validation.
        System Python installations may be more lenient.
        https://www.rfc-editor.org/rfc/rfc5280#section-4.2.1.2
      */
      name: "subjectKeyIdentifier",
      subjectKeyIdentifier: createKeyIdentifier(cert.publicKey),
    },
    {
      /*
        Authority Key Identifier (AKI)
        
        Needed for Python virtualenv SSL validation and certificate path validation.
        This extension identifies the public key corresponding to the private key used to sign
        this certificate. It links this certificate to its issuing CA certificate.
        Without this, Python virtualenv certificate validation might fail
        https://www.rfc-editor.org/rfc/rfc5280#section-4.2.1.1
      */
      name: "authorityKeyIdentifier",
      keyIdentifier: authorityKeyIdentifier,
    },
  ]);
  cert.sign(certAuthority.privateKey, forge.md.sha256.create());

  const result = {
    privateKey: forge.pki.privateKeyToPem(keys.privateKey),
    certificate: forge.pki.certificateToPem(cert),
  };

  certCache.set(hostname, result);

  return result;
}

function loadCa() {
  const keyPath = path.join(certFolder, "ca-key.pem");
  const certPath = path.join(certFolder, "ca-cert.pem");

  let existingPrivateKey = null;

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const privateKeyPem = fs.readFileSync(keyPath, "utf8");
    const certPem = fs.readFileSync(certPath, "utf8");
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    const certificate = forge.pki.certificateFromPem(certPem);
    
    existingPrivateKey = privateKey;

    // Don't return a cert that is valid for less than 1 hour
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    /** @type {any} */
    const basicConstraints = certificate.getExtension("basicConstraints");
    const hasCriticalBasicConstraints = Boolean(
      basicConstraints && basicConstraints.critical
    );
    const hasSubjectKeyIdentifier = Boolean(
      certificate.getExtension("subjectKeyIdentifier")
    );
    const hasAuthorityKeyIdentifier = Boolean(
      certificate.getExtension("authorityKeyIdentifier")
    );
    if (
      certificate.validity.notAfter > oneHourFromNow &&
      hasCriticalBasicConstraints &&
      hasSubjectKeyIdentifier &&
      hasAuthorityKeyIdentifier
    ) {
      return { privateKey, certificate };
    }
  }

  const { privateKey, certificate } = generateCa(existingPrivateKey || undefined);
  
  // Ensure directory exists before writing files
  try {
    fs.mkdirSync(certFolder, { recursive: true });
  } catch (error) {
    // Directory might already exist or there's a permission issue
    if (/** @type {any} */(error).code !== 'EEXIST') {
      throw error;
    }
  }
  
  fs.writeFileSync(keyPath, forge.pki.privateKeyToPem(privateKey));
  fs.writeFileSync(certPath, forge.pki.certificateToPem(certificate));
  
  return { privateKey, certificate };
}

/**
 * @param {forge.pki.PrivateKey} [existingPrivateKey]
 */
function generateCa(existingPrivateKey) {
  const keys = existingPrivateKey 
    ? { 
        privateKey: existingPrivateKey, 
        publicKey: forge.pki.setRsaPublicKey(
          /** @type {any} */(existingPrivateKey).n, 
          /** @type {any} */(existingPrivateKey).e
        ) 
      }
    : forge.pki.rsa.generateKeyPair(2048);
    
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + 1);

  const attrs = [{ name: "commonName", value: "safe-chain proxy" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed: issuer === subject
  const keyIdentifier = createKeyIdentifier(cert.publicKey);
  cert.setExtensions([
    {
      name: "basicConstraints",
      cA: true,
      critical: true,
    },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      /*
        Subject Key Identifier (SKI)
        
        Needed for Python virtualenv SSL validation and certificate chain building.
        This extension provides a means of identifying certificates containing a particular public key.
        Python virtualenv environments require this for proper certificate chain validation.
        System Python installations may be more lenient.
        https://www.rfc-editor.org/rfc/rfc5280#section-4.2.1.2
      */
      name: "subjectKeyIdentifier",
      subjectKeyIdentifier: keyIdentifier,
    },
    {
      /*
        Authority Key Identifier (AKI)
        
        Needed for Python virtualenv SSL validation and certificate path validation.
        This extension identifies the public key corresponding to the private key used to sign
        this certificate. It links this certificate to its issuing CA certificate.
        Without this, Python virtualenv certificate validation might fail
        https://www.rfc-editor.org/rfc/rfc5280#section-4.2.1.1
      */
      name: "authorityKeyIdentifier",
      keyIdentifier,
    },
  ]);
  cert.sign(/** @type {any} */(keys.privateKey), forge.md.sha256.create());

  return {
    privateKey: keys.privateKey,
    certificate: cert,
  };
}
