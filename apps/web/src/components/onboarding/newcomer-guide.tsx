import { Button, Card } from '@shadowob/ui'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { type ElementType, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BuddyCatSvg, CatSvgDefs, ChannelCatSvg, WorkCatSvg } from './cat-svg'

interface NewcomerGuideProps {
  onHaveBuddy: () => void
  onNoBuddy: () => void
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
    icon: BuddyCatSvg,
    color: 'text-warning',
    tags: ['产品定位', '超级社区', '协作空间'],
  },
  {
    id: 'slide2',
    icon: WorkCatSvg,
    color: 'text-primary',
    tags: ['成员管理', '公开/私密', '社区中枢'],
  },
  {
    id: 'slide3',
    icon: ChannelCatSvg,
    color: 'text-info',
    tags: ['话题分区', '信息沉淀', '高效沟通'],
  },
  {
    id: 'slide4',
    icon: BuddyCatSvg,
    color: 'text-info',
    tags: ['多 Buddy', '自动协作', '持续产出'],
  },
  {
    id: 'slide5',
    icon: WorkCatSvg,
    color: 'text-primary',
    tags: ['创建服务器', '搭建频道', '召唤 Buddy'],
  },
]

export function NewcomerGuide({ onHaveBuddy, onNoBuddy }: NewcomerGuideProps) {
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
        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-primary to-primary blur-3xl" />
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
                <div key={idx} className="w-full flex-shrink-0 px-4">
                  <Card
                    variant="glass"
                    className="!rounded-[40px] p-8 mb-6 flex flex-col items-center min-h-[420px] justify-center"
                  >
                    <div className="w-48 h-48 mb-6 drop-shadow-md mx-auto transform transition-transform duration-500 hover:scale-105">
                      <slide.icon />
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-text-primary to-text-secondary">
                      {t(`onboarding.newcomer.${slide.id}.title`)}
                    </h2>
                    <p className="text-text-muted text-base md:text-lg leading-relaxed mb-6 max-w-xs mx-auto font-bold italic">
                      {t(`onboarding.newcomer.${slide.id}.desc`)}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap justify-center gap-2 mt-auto">
                      {slide.tags.map((tag, tagIdx) => (
                        <span
                          key={tagIdx}
                          className="text-xs px-3 py-1 rounded-full bg-primary/5 border border-primary/20 text-text-secondary font-bold"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Arrows */}
          <button
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 md:-translate-x-6 p-2 rounded-full bg-bg-tertiary/50 backdrop-blur-xl shadow-md border border-border-subtle text-text-secondary transition-all ${
              currentSlide === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100 hover:scale-110'
            }`}
          >
            <ChevronLeft size={24} />
          </button>

          <button
            onClick={nextSlide}
            disabled={currentSlide === slides.length - 1}
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 md:translate-x-6 p-2 rounded-full bg-bg-tertiary/50 backdrop-blur-xl shadow-md border border-border-subtle text-text-secondary transition-all ${
              currentSlide === slides.length - 1
                ? 'opacity-0 pointer-events-none'
                : 'opacity-100 hover:scale-110'
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
                  ? 'w-8 h-2 bg-gradient-to-r from-primary to-primary'
                  : 'w-2 h-2 bg-border-primary hover:bg-text-muted'
              }`}
              onClick={() => setCurrentSlide(idx)}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 w-full max-w-md mx-auto z-10 px-4">
          <Button
            variant="secondary"
            size="lg"
            className="w-full text-lg"
            onClick={onHaveBuddy}
            iconRight={ArrowRight}
          >
            {t('onboarding.newcomer.btnHaveClaw', '立即加入')}
          </Button>

          <Button variant="ghost" size="md" className="w-full" onClick={onNoBuddy}>
            {t('onboarding.newcomer.btnNoClaw', '先逛逛，稍后加入')}
          </Button>
        </div>
      </div>
    </div>
  )
}
