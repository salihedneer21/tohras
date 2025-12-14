require('dotenv').config();
const fetch = require('node-fetch');

const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || 'mytorahtales.myshopify.com';
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_GRAPHQL_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/graphql.json`;

const URL_REGEX = /(https?:\/\/[^\s"')]+)/gi;
const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|webp|gif|heic|heif|bmp|tiff?)(\?.*)?$/i;

const extractUrlsFromText = (text) => {
  if (typeof text !== 'string') return [];
  const matches = [];
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
};

const filterImageUrls = (urls) =>
  urls.filter((url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed.startsWith('http')) return false;
    if (IMAGE_EXTENSION_REGEX.test(trimmed)) return true;
    if (trimmed.includes('cdn.shopify.com')) return true;
    return false;
  });

const buildOrderQueryFromInput = (input) => {
  if (!input) return 'name:#1028';
  const raw = String(input).trim();
  if (/^#?\d+$/.test(raw)) {
    const withHash = raw.startsWith('#') ? raw : `#${raw}`;
    return `name:${withHash}`;
  }
  return raw;
};

const getOrderCustomerImageUrls = async (orderIdentifier) => {
  if (!SHOPIFY_API_KEY) {
    throw new Error('Missing SHOPIFY_API_KEY in environment');
  }

  const orderQuery = buildOrderQueryFromInput(orderIdentifier);

  const graphqlQuery = `
    query getOrderCustomerUploads($orderQuery: String!) {
      orders(first: 1, query: $orderQuery) {
        edges {
          node {
            id
            name
            lineItems(first: 50) {
              edges {
                node {
                  id
                  name
                  title
                  customAttributes {
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch(SHOPIFY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_API_KEY,
    },
    body: JSON.stringify({
      query: graphqlQuery,
      variables: { orderQuery },
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(
      `Shopify GraphQL request failed: ${response.status} ${response.statusText}${
        bodyText ? ` - ${bodyText}` : ''
      }`
    );
  }

  const json = await response.json();

  if (json.errors && json.errors.length) {
    const message = json.errors.map((e) => e.message).join('; ');
    throw new Error(`Shopify GraphQL returned errors: ${message}`);
  }

  const orderEdge = json.data?.orders?.edges?.[0];

  if (!orderEdge) {
    return {
      orderId: null,
      orderName: null,
      imageUrls: [],
    };
  }

  const order = orderEdge.node;
  const imageUrls = [];

  const lineItems = order.lineItems?.edges || [];
  lineItems.forEach((edge) => {
    const item = edge?.node;
    if (!item) return;
    const attrs = item.customAttributes || [];
    attrs.forEach((attr) => {
      const value = attr?.value;
      if (!value) return;
      const urlsInValue = extractUrlsFromText(value);
      const imageUrlsInValue = filterImageUrls(urlsInValue);
      imageUrls.push(...imageUrlsInValue);
    });
  });

  // Extract book name, child name, age, gender and dedication
  let bookName = null;
  let childName = null;
  let age = null;

  const firstLineItem = lineItems[0]?.node;
  if (firstLineItem) {
    bookName = firstLineItem.title || firstLineItem.name || null;
  }

  const ageCandidates = [];
  const bookNameCandidates = [];
  const genderCandidates = [];
  const dedicationCandidates = [];
  const childNameCandidates = [];

  const collectFromAttributes = (attrs) => {
    if (!Array.isArray(attrs)) return;
    attrs.forEach((attr) => {
      const key = (attr?.key || attr?.name || '').toString().toLowerCase();
      const value = (attr?.value || '').toString();
      if (!key || !value) return;

      if (key.includes('age')) {
        ageCandidates.push(value);
      }
      if (key.includes('gender')) {
        genderCandidates.push(value);
      }
      if (key.includes('book') && key.includes('name')) {
        bookNameCandidates.push(value);
      }
      if (key.includes('child') && key.includes('name')) {
        childNameCandidates.push(value);
      }
      if (key.includes('dedication')) {
        dedicationCandidates.push(value);
      }
    });
  };

  // Line-item custom attributes
  lineItems.forEach((edge) => {
    const item = edge?.node;
    if (!item) return;
    collectFromAttributes(item.customAttributes);
  });

  if (!bookName && bookNameCandidates.length) {
    bookName = bookNameCandidates[0];
  }

  if (!childName && childNameCandidates.length) {
    childName = childNameCandidates[0];
  }

  if (ageCandidates.length) {
    age = ageCandidates[0];
  }

  let gender = null;
  if (genderCandidates.length) {
    gender = genderCandidates[0];
  }

  let dedication = null;
  if (dedicationCandidates.length) {
    dedication = dedicationCandidates[0];
  }

  const uniqueImageUrls = Array.from(new Set(imageUrls));

  return {
    orderId: order.id,
    orderName: order.name,
    bookName,
    childName,
    age,
    gender,
    dedication,
    imageUrls: uniqueImageUrls,
  };
};

if (require.main === module) {
  const orderArg = process.argv[2];

  if (!orderArg) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: node src/scripts/shopifyOrderImages.js <order-number-or-graph-ql-query>'
    );
    process.exit(1);
  }

  getOrderCustomerImageUrls(orderArg)
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error fetching Shopify customer image URLs:', error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  getOrderCustomerImageUrls,
};
