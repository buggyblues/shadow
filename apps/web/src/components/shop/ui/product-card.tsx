import React from 'react'
import { PriceDisplay } from './currency'
import { Package, Plus } from 'lucide-react'
import type { Product } from '../shop-page'

interface ProductCardProps {
  product: Product
  onClick: (id: string) => void
  onAddToCart?: (product: Product, e: React.MouseEvent) => void
}

export function ProductCard({ product, onClick, onAddToCart }: ProductCardProps) {
  const imageUrl = product.media?.[0]?.url

  return (
    <div 
      onClick={() => onClick(product.id)}
      className="group flex flex-col bg-white dark:bg-[#1A1A1A] rounded-2xl md:rounded-3xl border border-gray-100 dark:border-white/5 overflow-hidden hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
    >
      {/* Image container: responsive aspect ratio, perfect for e-commerce */}
      <div className="relative w-full aspect-[4/5] bg-gray-50 dark:bg-white/5 overflow-hidden">
        {imageUrl ? (
          <img 
            src={imageUrl} 
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.33,1,0.68,1)] group-hover:scale-105"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 dark:text-gray-600">
            <Package size={48} strokeWidth={1} />
          </div>
        )}
        
        {/* Top-left tag: Entitlement or Type info */}
        {product.type === 'entitlement' && (
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 dark:bg-black/90 backdrop-blur-md rounded-lg text-xs font-bold text-gray-900 dark:text-white shadow-sm">
            虚拟权益
          </div>
        )}

        {/* Hover overlay add to cart button (PC friendly) */}
        {onAddToCart && (
          <div className="absolute bottom-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10 hidden md:block">
            <button 
              type="button" 
              onClick={(e) => onAddToCart(product, e)}
              className="w-10 h-10 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-gray-900 dark:text-white shadow-lg hover:scale-110 active:scale-95 transition-transform"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      {/* Content wrapper */}
      <div className="flex-1 p-4 flex flex-col">
        <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight mb-1 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
          {product.name}
        </h3>
        
        {product.summary && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mb-3">
            {product.summary}
          </p>
        )}

        <div className="mt-auto pt-3 flex items-end justify-between">
          <PriceDisplay amount={product.basePrice} size={18} showFree />
          
          <span className="text-[11px] text-gray-400 font-medium">
            已售 {product.salesCount > 999 ? '999+' : product.salesCount}
          </span>
        </div>
      </div>
    </div>
  )
}
