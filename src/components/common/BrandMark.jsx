import markSrc from '../../assets/brand/zl-mark.png';

export const BRAND_MARK_SRC = markSrc;

export function BrandMarkImg({ className = '', alt = '' }) {
  return <img className={className} src={markSrc} alt={alt} draggable="false" />;
}

export default BrandMarkImg;
