import { Image } from '@tarojs/components';
import markSrc from '../../assets/brand/zl-mark.png';

export const BRAND_MARK_SRC = markSrc;

export function BrandMark({ className = '', alt = '智了空间' }) {
  return <Image className={className} src={markSrc} mode="aspectFit" alt={alt} />;
}

export function BrandMarkImg({ className = '', alt = '' }) {
  return <img className={className} src={markSrc} alt={alt} draggable="false" />;
}

export default BrandMark;
