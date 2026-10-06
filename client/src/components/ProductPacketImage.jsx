import React, { useState } from 'react';

/**
 * ProductPacketImage component
 * Displays official Nandini milk packet photograph or stylized pouch graphic
 * according to product name and variant.
 */
export default function ProductPacketImage({
  product = {},
  size = 48,
  style = {},
  className = ''
}) {
  const [imageFailed, setImageFailed] = useState(false);

  const rawUrl = product.product_image_url || product.image_url;
  const name = (product.product_name_snapshot || product.name || '').toLowerCase();

  // Determine fallback image source based on Nandini product branding
  let defaultPacketSrc = '/images/products/toned-blue.jpg';
  let badgeTheme = { bg: '#e0f2fe', border: '#0284c7', text: '#0369a1', label: 'TONED' };

  if (name.includes('shubham') || name.includes('orange')) {
    defaultPacketSrc = '/images/products/orange-shubham.jpg';
    badgeTheme = { bg: '#ffedd5', border: '#ea580c', text: '#c2410c', label: 'SHUBHAM' };
  } else if (name.includes('samruddhi') || name.includes('red')) {
    defaultPacketSrc = '/images/products/samruddhi-red.jpg';
    badgeTheme = { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c', label: 'SAMRUDDHI' };
  } else if (name.includes('curd') || name.includes('dahi') || name.includes('mosaru')) {
    defaultPacketSrc = '/images/products/curd-dahi.jpg';
    badgeTheme = { bg: '#ecfeff', border: '#06b6d4', text: '#0e7490', label: 'CURD' };
  } else if (name.includes('special') || name.includes('green') || name.includes('homo')) {
    defaultPacketSrc = '/images/products/special-green.jpg';
    badgeTheme = { bg: '#dcfce7', border: '#16a34a', text: '#15803d', label: 'SPECIAL' };
  }

  const finalSrc = !imageFailed && rawUrl ? rawUrl : defaultPacketSrc;

  return (
    <div
      className={className}
      style={{
        width: typeof size === 'number' ? `${size}px` : size,
        height: typeof size === 'number' ? `${size}px` : size,
        minWidth: typeof size === 'number' ? `${size}px` : size,
        minHeight: typeof size === 'number' ? `${size}px` : size,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1.5px solid #e2e8f0',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        position: 'relative',
        flexShrink: 0,
        ...style
      }}
      title={product.product_name_snapshot || product.name || 'Product'}
    >
      <img
        src={finalSrc}
        alt={product.product_name_snapshot || product.name || 'Product'}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block'
        }}
        onError={() => setImageFailed(true)}
      />
    </div>
  );
}
