import { Badge, Button, Card, CardContent } from '@shadowob/ui'
import { Package, Plus } from 'lucide-react'
import type React from 'react'
import type { Product } from '../shop-page'
import { PriceDisplay } from './currency'

interface ProductCardProps {
  product: Product
  onClick: (id: string) => void
  onAddToCart?: (product: Product, e: React.MouseEvent) => void
}

export function ProductCard({ product, onClick, onAddToCart }: ProductCardProps) {
  const imageUrl = product.media?.[0]?.url

  return (
    <Card
      variant="glass"
      hoverable
      className="group flex flex-col cursor-pointer !rounded-[40px]"
      onClick={() => onClick(product.id)}
    >
      {/* Image container */}
      <div className="relative w-full aspect-[4/5] bg-bg-tertiary/30 overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:scale-105"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted/30">
            <Package size={48} strokeWidth={1} />
          </div>
        )}

        {/* Top-left tag: Entitlement badge */}
        {product.type === 'entitlement' && (
          <div className="absolute top-3 left-3">
            <Badge variant="warning" size="sm">
              虚拟权益
            </Badge>
          </div>
        )}

        {/* Hover overlay add to cart button (PC friendly) */}
        {onAddToCart && (
          <div className="absolute bottom-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10 hidden md:block">
            <Button
              variant="glass"
              size="icon"
              onClick={(e) => onAddToCart(product, e)}
              icon={Plus}
            />
          </div>
        )}
      </div>

      {/* Content wrapper */}
      <CardContent className="flex-1 flex flex-col p-4 pt-4">
        <h3 className="text-[15px] font-black text-text-primary line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors">
          {product.name}
        </h3>

        {product.summary && (
          <p className="text-xs text-text-muted line-clamp-1 mb-3">{product.summary}</p>
        )}

        <div className="mt-auto pt-3 flex items-end justify-between">
          <PriceDisplay amount={product.basePrice} size={18} showFree />

          <span className="text-[11px] text-text-muted font-bold">
            已售 {product.salesCount > 999 ? '999+' : product.salesCount}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
