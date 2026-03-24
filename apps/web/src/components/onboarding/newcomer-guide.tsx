import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { type ElementType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AgentCatSvg, CatSvgDefs, ChannelCatSvg, WorkCatSvg } from './cat-svg'

interface NewcomerGuideProps {
  onHaveClaw: () => void
  onNoClaw: () => void
}

type SlideId = 'slide1' | 'slide2' | 'slide3' | 'slide4' | 'slide5'

type Slide = {
  id: SlideId
  icon: ElementType
  color: string
  tags: string[]
}

const slides: Slide[] = [
  {
    id: 'slide1',
    icon: AgentCatSvg,
    color: 'text-amber-400',
    tags: ['产品定位', '超级社区', '协作空间'],
  },
  {
    id: 'slide2',
    icon: WorkCatSvg,
    color: 'text-cyan-400',
    tags: ['成员管理', '公开/私密', '社区中枢'],
  },
  {
    id: 'slide3',
    icon: ChannelCatSvg,
    color: 'text-pink-400',
    tags: ['话题分区', '信息沉淀', '高效沟通'],
  },
  {
    id: 'slide4',
    icon: AgentCatSvg,
    color: 'text-purple-400',
    tags: ['多 Agent', '自动协作', '持续产出'],
  },
  {
    id: 'slide5',
    icon: WorkCatSvg,
    color: 'text-blue-400',
    tags: ['创建服务器', '搭建频道', '召唤 Buddy'],
  },
]

export function NewcomerGuide({ onHaveClaw, onNoClaw }: NewcomerGuideProps) {
  const { t } = useTranslation()
  const [currentSlide, setCurrentSlide] = useState(0)

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1)
    }
  }

  return (
    <div className="flex flex-col h-full bg-bg-secondary p-6 md:p-8 animate-in fade-in zoom-in duration-300 relative overflow-hidden">
      <CatSvgDefs />

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-5">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-amber-400 to-purple-500 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 blur-3xl" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center z-10 w-full">
        {/* Carousel Content */}
        <div className="w-full max-w-lg mx-auto mb-8 relative">
          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {slides.map((slide, idx) => (
                <div key={slide.id} className="w-full flex-shrink-0 px-4">
                  <div className="bg-bg-primary/80 backdrop-blur-sm rounded-3xl p-8 mb-6 flex flex-col items-center shadow-lg border border-border-primary/30 min-h-[420px] justify-center transition-all duration-300 hover:shadow-xl hover:scale-[1.01]">
                    <div className="w-48 h-48 mb-6 drop-shadow-md mx-auto transform transition-transform duration-500 hover:scale-105">
                      <slide.icon />
                    </div>
                    <h2
                      className={`text-2xl md:text-3xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-text-primary to-text-secondary`}
                    >
                      {t(`onboarding.newcomer.${slide.id}.title`)}
                    </h2>
                    <p className="text-text-muted text-base md:text-lg leading-relaxed mb-6 max-w-xs mx-auto">
                      {t(`onboarding.newcomer.${slide.id}.desc`)}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap justify-center gap-2 mt-auto">
                      {slide.tags.map((tag, tagIdx) => (
                        <span
                          key={tagIdx}
                          className={`text-xs px-3 py-1 rounded-full bg-bg-secondary border border-border-primary/50 text-text-secondary`}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 md:-translate-x-6 p-2 rounded-full bg-bg-card shadow-md border border-border-primary text-text-secondary transition-all ${
              currentSlide === 0
                ? 'opacity-0 pointer-events-none'
                : 'opacity-100 hover:bg-bg-secondary hover:text-text-primary'
            }`}
          >
            <ChevronLeft size={24} />
          </button>

          <button
            onClick={nextSlide}
            disabled={currentSlide === slides.length - 1}
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 md:translate-x-6 p-2 rounded-full bg-bg-card shadow-md border border-border-primary text-text-secondary transition-all ${
              currentSlide === slides.length - 1
                ? 'opacity-0 pointer-events-none'
                : 'opacity-100 hover:bg-bg-secondary hover:text-text-primary'
            }`}
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Indicators */}
        <div className="flex items-center justify-center space-x-2 mb-8">
          {slides.map((_, idx) => (
            <button
              key={idx}
              className={`transition-all duration-300 rounded-full ${
                currentSlide === idx
                  ? 'w-8 h-2 bg-gradient-to-r from-cyan-400 to-blue-500'
                  : 'w-2 h-2 bg-border-primary hover:bg-text-muted'
              }`}
              onClick={() => setCurrentSlide(idx)}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 w-full max-w-md mx-auto z-10 px-4">
          <button
            onClick={onHaveClaw}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all duration-200 text-lg"
          >
            <span>{t('onboarding.newcomer.btnHaveClaw', '立即加入')}</span>
            <ArrowRight size={20} />
          </button>

          <button
            onClick={onNoClaw}
            className="w-full text-text-muted hover:text-text-primary py-3 px-6 rounded-xl hover:bg-bg-tertiary transition-colors text-sm font-medium"
          >
            {t('onboarding.newcomer.btnNoClaw', '先逛逛，稍后加入')}
          </button>
        </div>
      </div>
    </div>
  )
}
