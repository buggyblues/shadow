import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Divider,
  Indicator,
  Input,
  Kbd,
  Label,
  ListHeader,
  NativeSelect,
  PageContainer,
  Progress,
  ScrollArea,
  SectionHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Switch,
  Toaster,
  Typography,
} from '@shadowob/ui'
import {
  AlertCircle,
  ChevronRight,
  Github,
  Home,
  Info,
  Layout,
  Mail,
  MessageCircle,
  Moon,
  Plus,
  Settings,
  Sun,
  Type,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

function App() {
  const [isDark, setIsDark] = useState(true)
  const [toggleEnabled, setToggleEnabled] = useState(false)

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const toggleTheme = () => setIsDark(!isDark)

  return (
    <div className="min-h-screen bg-bg-deep selection:bg-primary/30 selection:text-primary relative overflow-x-hidden transition-colors duration-500 pb-20 font-sans">
      {/* Background Atmosphere - Exact Opacities from Master Preview */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-150px] left-[5%] w-[600px] h-[600px] bg-primary/20 dark:bg-primary/10 rounded-full blur-[120px] animate-float opacity-50 dark:opacity-25"></div>
        <div
          className="absolute top-[25%] right-[-150px] w-[700px] h-[700px] bg-[#ff2a55]/15 dark:bg-[#ff2a55]/10 rounded-full blur-[120px] animate-float opacity-50 dark:opacity-25"
          style={{ animationDelay: '-7s' }}
        ></div>
        <div
          className="absolute bottom-[-100px] left-[30%] w-[500px] h-[500px] bg-accent/15 dark:bg-accent/10 rounded-full blur-[120px] animate-float opacity-40 dark:opacity-25"
          style={{ animationDelay: '-14s' }}
        ></div>
      </div>

      <Toaster position="top-right" richColors />

      {/* Floating Capsule Navigation */}
      <div className="fixed top-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center">
        <nav className="w-full max-w-5xl px-6 py-3 bg-white/60 dark:bg-[rgba(5,5,8,0.6)] backdrop-blur-[32px] border border-white/80 dark:border-[rgba(255,255,255,0.08)] rounded-[24px] shadow-[0_10px_40px_rgba(0,0,0,0.04)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-center justify-between pointer-events-auto transition-all">
          <div className="flex items-center gap-4">
            <img src="/Logo.svg" alt="Shadow Logo" className="w-9 h-9 bouncy" />
            <Typography
              variant="h3"
              className="mb-0 text-text-primary lowercase tracking-tighter text-xl hidden sm:block font-black"
            >
              Shadow <b>SOFT-POP</b>
            </Typography>
          </div>

          <div className="flex items-center gap-4 md:gap-8">
            <ul className="hidden md:flex items-center gap-6">
              <li>
                <a
                  href="#tokens"
                  className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-primary transition-colors"
                >
                  Tokens
                </a>
              </li>
              <li>
                <a
                  href="#components"
                  className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-primary transition-colors"
                >
                  Showcase
                </a>
              </li>
              <li>
                <a
                  href="#stream"
                  className="text-xs font-black uppercase tracking-widest text-text-muted hover:text-primary transition-colors"
                >
                  Stream
                </a>
              </li>
            </ul>

            <div className="h-6 w-px bg-border-subtle opacity-50 hidden sm:block"></div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-text-primary"
              >
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
              <Avatar
                size="sm"
                userId="playground-user"
                status="online"
                className="shadow-2xl shadow-primary/20"
              />
            </div>
          </div>
        </nav>
      </div>

      <PageContainer className="pt-32 pb-12 space-y-32">
        {/* HERO SECTION - Exact Preview Style */}
        <section className="text-center space-y-10 py-24 relative z-10">
          <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-primary/10 border border-primary/20 scale-110 mb-6 shadow-2xl shadow-primary/5 animate-spring-in backdrop-blur-md">
            <Indicator status="running" size="sm" />
            <span className="text-[11px] font-black uppercase tracking-[0.3em] text-primary dark:text-primary">
              Neon Frost V1.0
            </span>
          </div>
          <Typography
            variant="h1"
            className="max-w-5xl mx-auto leading-[1.05] text-6xl md:text-[80px] text-text-primary tracking-[-0.04em] font-black"
          >
            Build with Luminous <br />
            Precision
          </Typography>
          <Typography
            variant="body"
            className="max-w-2xl mx-auto text-xl md:text-2xl text-text-secondary font-bold leading-relaxed opacity-80"
          >
            A sensory-rich UI library for next-generation developer tools. Tactile surfaces, rim-lit
            buttons, and atmospheric glassmorphism.
          </Typography>
          <div className="flex flex-wrap items-center justify-center gap-6 pt-6">
            <Button size="lg" className="px-12 h-14 text-lg" iconRight={ChevronRight}>
              Quick Start
            </Button>
            <Button size="lg" variant="secondary" className="h-14 text-lg" icon={Github}>
              GitHub Repo
            </Button>
            <Button size="lg" variant="accent" className="h-14 text-lg" icon={Zap}>
              Marketplace
            </Button>
          </div>
        </section>

        <Divider label="Design Tokens" />

        {/* TYPOGRAPHY SECTION */}
        <section id="tokens" className="space-y-16">
          <SectionHeader
            title="Typography & Tokens"
            description="Engineered for readability and technical impact."
            icon={Type}
          />
          <div className="grid gap-8 text-left">
            <Card
              variant="glass"
              className="p-12 space-y-16"
            >
              <div className="space-y-8">
                <Label className="text-primary-strong dark:text-primary font-black opacity-100 uppercase tracking-widest text-xs">
                  Heading Hierarchy
                </Label>
                <div className="space-y-10">
                  <div className="space-y-2">
                    <Typography
                      variant="h1"
                      className="text-text-primary mb-0 tracking-[-0.02em] font-black"
                    >
                      Display Hero Header
                    </Typography>
                    <Typography variant="micro" className="font-mono text-text-muted">
                      80PX / BLACK 900 / -0.04EM
                    </Typography>
                  </div>
                  <div className="space-y-2">
                    <Typography
                      variant="h2"
                      className="text-text-primary mb-0 tracking-[-0.01em] font-black"
                    >
                      Section Title Header
                    </Typography>
                    <Typography variant="micro" className="font-mono text-text-muted">
                      44PX / BLACK 900 / -0.02EM
                    </Typography>
                  </div>
                  <div className="space-y-2">
                    <Typography
                      variant="h3"
                      className="text-text-primary mb-0 tracking-tight font-extrabold"
                    >
                      Module Title Header
                    </Typography>
                    <Typography variant="micro" className="font-mono text-text-muted">
                      22PX / BLACK 900
                    </Typography>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-16 border-t border-border-subtle pt-16">
                <div className="space-y-6">
                  <Label className="text-accent-strong dark:text-accent font-black opacity-100 uppercase tracking-widest text-xs">
                    Body Text (Lorem Ipsum)
                  </Label>
                  <Typography
                    variant="body"
                    className="text-lg leading-relaxed text-text-primary font-bold"
                  >
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                    incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
                    nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                    <Kbd className="ml-2">Ctrl + K</Kbd>
                  </Typography>
                </div>
                <div className="space-y-6">
                  <Label className="text-success-strong dark:text-success font-black opacity-100 uppercase tracking-widest text-xs">
                    CJK Typography (Noto Sans SC)
                  </Label>
                  <div className="space-y-4">
                    <Typography
                      variant="h3"
                      className="mb-0 text-text-primary font-extrabold"
                    >
                      极致的“霓虹冰感”美学
                    </Typography>
                    <Typography
                      variant="body"
                      className="text-lg leading-[1.8] tracking-[0.03em] text-text-secondary font-bold"
                    >
                      霓虹冰感设计系统 (Neon Frost) 完美解决了中文字符在复杂背景下的阅读问题。
                      通过增加 1.8 的行高与 0.03em 的字间距，确保文字在毛玻璃背景上依然清晰可读。
                    </Typography>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* COLORS SECTION */}
        <section id="colors" className="space-y-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-left">
            {[
              {
                name: 'Electric Cyan',
                color: 'bg-primary',
                glow: 'shadow-[0_15px_35px_rgba(0,243,255,0.3)]',
                hex: '#00F3FF',
                labelClass: 'text-primary dark:text-primary',
              },
              {
                name: 'Vivid Yellow',
                color: 'bg-accent',
                glow: 'shadow-[0_15px_35px_rgba(248,231,28,0.3)]',
                hex: '#F8E71C',
                labelClass: 'text-accent dark:text-accent',
              },
              {
                name: 'Success Emerald',
                color: 'bg-success',
                glow: 'shadow-[0_15px_35px_rgba(0,230,118,0.3)]',
                hex: '#00E676',
                labelClass: 'text-success dark:text-success',
              },
              {
                name: 'Danger Crimson',
                color: 'bg-danger',
                glow: 'shadow-[0_15px_35px_rgba(255,42,85,0.3)]',
                hex: '#FF2A55',
                labelClass: 'text-danger dark:text-danger',
              },
            ].map((item) => (
              <div key={item.name} className="space-y-4 bouncy group">
                <div
                  className={`h-32 rounded-[32px] ${item.color} ${item.glow} transition-all group-hover:scale-105 group-hover:rotate-2`}
                ></div>
                <div className="text-center">
                  <Typography
                    variant="body"
                    className={`font-black uppercase tracking-widest text-sm mb-1 ${item.labelClass}`}
                  >
                    {item.name}
                  </Typography>
                  <Typography variant="micro" className="font-mono opacity-50 text-text-muted">
                    {item.hex}
                  </Typography>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Divider label="Interactive Showcase" />

        {/* COMPONENTS SHOWCASE */}
        <section id="components" className="space-y-16 text-left">
          <SectionHeader
            title="Interactive Suite"
            description="Tactile buttons and high-density controls."
            icon={Layout}
          />

          <div className="grid lg:grid-cols-2 gap-12 text-left">
            <Card
              variant="glass"
              className="p-10 space-y-10"
            >
              <ListHeader label="Button States" count={7} />
              <div className="flex flex-wrap gap-6">
                <Button>Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="accent">Accent</Button>
                <Button variant="danger">Danger</Button>
              </div>
              <div className="flex flex-wrap gap-6">
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="glass">Glassmorphic</Button>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <Button loading>Deploying</Button>
                <Button icon={Mail}>Send Mail</Button>
                <Button iconRight={ChevronRight} variant="accent">
                  Continue
                </Button>
              </div>
            </Card>

            <Card
              variant="glass"
              className="p-10 space-y-10"
            >
              <ListHeader label="Form Controls" />
              <div className="space-y-6">
                <Input label="Username Handle" icon={Mail} placeholder="@shadow_dev" />
                <div className="grid grid-cols-2 gap-6">
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Access Level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="user">Standard User</SelectItem>
                    </SelectContent>
                  </Select>
                  <NativeSelect>
                    <option>Region: Asia</option>
                    <option>Region: US</option>
                  </NativeSelect>
                </div>
                <div className="flex items-center justify-between p-5 bg-white dark:bg-bg-tertiary/50 border-2 border-[#F1F5F9] dark:border-border-subtle rounded-[20px] shadow-[inset_0_2px_6px_rgba(0,0,0,0.02)] dark:shadow-inner">
                  <div className="flex flex-col text-left">
                    <span className="font-black text-sm uppercase tracking-wide text-text-primary">
                      High Fidelity Mode
                    </span>
                    <span className="text-xs text-text-muted font-bold opacity-60">
                      Enable advanced glass blur
                    </span>
                  </div>
                  <Switch checked={toggleEnabled} onCheckedChange={setToggleEnabled} />
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* FEEDBACK & OVERLAYS */}
        <section id="feedback" className="space-y-16 text-left">
          <SectionHeader
            title="Overlays & Feedback"
            description="Modern modal systems and status alerts."
            icon={AlertCircle}
          />
          <div className="grid lg:grid-cols-2 gap-12 text-left">
            <Card variant="glass" className="p-10 space-y-8">
              <Typography variant="h3" className="mb-0 text-text-primary font-extrabold">
                Modal Systems
              </Typography>
              <Typography
                variant="body"
                className="text-text-muted font-bold leading-relaxed"
              >
                Glassmorphic dialogs, slide-over sheets, and destructive confirmation flows.
              </Typography>
              <div className="flex flex-col gap-4">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" className="w-full h-14 justify-center">
                      Open Configuration
                    </Button>
                  </DialogTrigger>
                  <DialogContent maxWidth="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>System Update</DialogTitle>
                      <DialogDescription>
                        A new version of the Shadow client is ready.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-12 space-y-6 text-left">
                      <Alert variant="info">
                        <Info size={18} />
                        <AlertTitle>Critical Patch</AlertTitle>
                        <AlertDescription>
                          This update includes security improvements for your buddies.
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-4">
                        <div className="flex justify-between items-baseline">
                          <Label>Download Progress</Label>
                          <span className="text-[10px] font-black text-primary">82%</span>
                        </div>
                        <Progress value={82} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => toast.success('Update installed successfully!')}>
                        Restart Now
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="secondary" size="lg" className="w-full h-14 justify-center">
                      View Activity Feed
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right">
                    <SheetHeader>
                      <SheetTitle>Activity Feed</SheetTitle>
                      <SheetDescription>Recent events across your network.</SheetDescription>
                    </SheetHeader>
                    <div className="py-8 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="p-4 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex gap-4 items-start cursor-pointer border border-transparent hover:border-border-subtle group text-left"
                        >
                          <Indicator status={i === 1 ? 'online' : 'offline'} className="mt-1.5" />
                          <div>
                            <div className="font-black text-sm uppercase text-text-primary group-hover:text-primary transition-colors">
                              Buddy Update #{i}
                            </div>
                            <div className="text-xs font-bold text-text-muted italic opacity-60">
                              System successfully deployed.
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              <div className="flex gap-4 pt-4 border-t border-border-subtle">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="danger" size="sm" className="flex-1 min-w-0">
                      Wipe Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. All workspace data will be wiped.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-danger text-white border-none">
                        Confirm Wipe
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 min-w-0 text-text-primary font-black"
                  onClick={() => toast.info('System scan initiated...')}
                >
                  Test Toast
                </Button>
              </div>
            </Card>

            <Card variant="glass" className="p-0 overflow-hidden text-left">
              <ScrollArea className="h-[500px]">
                <div className="p-10 space-y-6">
                  <ListHeader label="Member Feed" count={42} />
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-5 border-b border-border-subtle last:border-0 group cursor-pointer transition-all hover:px-2"
                    >
                      <div className="flex items-center gap-5">
                        <Avatar
                          userId={`cat-${i}`}
                          size="md"
                          status={i % 2 === 0 ? 'online' : 'idle'}
                          className="shadow-2xl shadow-primary/10 border-white/20"
                        />
                        <div className="space-y-1">
                          <div className="text-sm font-black uppercase text-text-primary group-hover:text-primary transition-colors tracking-tight">
                            Buddy Operation #{i * 100}
                          </div>
                          <div className="text-[10px] text-text-muted font-bold tracking-widest opacity-60 uppercase">
                            LOGGED AT 14:{40 + i} · SECTOR 7
                          </div>
                        </div>
                      </div>
                      <Badge variant={i % 3 === 0 ? 'danger' : 'success'} size="xs">
                        {i % 3 === 0 ? 'ERROR' : 'SYNCED'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </div>
        </section>

        {/* MESSAGE STREAM SECTION */}
        <section id="stream" className="space-y-12 pb-24 text-left">
          <SectionHeader
            title="Channel Stream"
            description="Discord-inspired high-density message vertical."
            icon={MessageCircle}
          />
          <Card variant="glass" className="p-0 overflow-hidden text-left">
            <div className="p-10 space-y-12">
              <div className="flex gap-6">
                <Avatar
                  userId="system-cat"
                  size="lg"
                  status="online"
                  className="mt-1 shadow-2xl shadow-primary/20 border-white/20"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <Typography
                      variant="h3"
                      className="mb-0 text-primary-strong dark:text-primary lowercase text-xl font-black"
                    >
                      mascotadmin
                    </Typography>
                    <span className="text-[11px] font-black uppercase text-text-muted opacity-40 tracking-widest">
                      Today at 14:42
                    </span>
                  </div>
                  <Typography
                    variant="body"
                    className="text-lg font-bold leading-relaxed text-text-primary"
                  >
                    Welcome to the **Neon Frost Master Playground**. We've optimized the light mode
                    contrast and fixed the button jelly effects.
                  </Typography>
                  <div className="quote text-text-primary dark:text-text-secondary font-bold">
                    "This aesthetic is a high-energy fusion of gaming vibrance and technical
                    precision."
                  </div>
                </div>
              </div>

              <div className="flex gap-6">
                <Avatar
                  userId="dev-cat"
                  size="lg"
                  status="idle"
                  className="mt-1 shadow-2xl shadow-accent/20 border-white/20"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex items-baseline gap-3">
                    <Typography
                      variant="h3"
                      className="mb-0 text-text-primary lowercase text-xl font-black"
                    >
                      shadowdev
                    </Typography>
                    <span className="text-[11px] font-black uppercase text-text-muted opacity-40 tracking-widest">
                      Today at 14:45
                    </span>
                  </div>
                  <Typography
                    variant="body"
                    className="text-lg font-bold leading-relaxed text-text-primary"
                  >
                    The dark/light mode switcher is now active in the top-right corner. Try it out!
                    🚀
                  </Typography>
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-border-subtle">
              <Input
                icon={Plus}
                placeholder="Message #playground..."
              />
            </div>
          </Card>
        </section>
      </PageContainer>

      <footer className="py-32 text-center border-t border-border-subtle bg-bg-primary/20 backdrop-blur-md relative z-10">
        <div className="max-w-xl mx-auto space-y-10 px-6">
          <img
            src="/Logo.svg"
            alt="Logo"
            className="w-16 h-16 mx-auto bouncy grayscale hover:grayscale-0 opacity-40 hover:opacity-100 transition-all duration-700"
          />
          <div className="flex justify-center gap-12 text-text-muted">
            <Settings
              className="hover:text-primary transition-all cursor-pointer hover:scale-110"
              size={36}
            />
            <Home
              className="hover:text-primary transition-all cursor-pointer hover:scale-110"
              size={36}
            />
            <Github
              className="hover:text-primary transition-all cursor-pointer hover:scale-110"
              size={36}
            />
          </div>
          <Typography
            variant="micro"
            className="opacity-40 tracking-[0.4em] text-text-muted uppercase"
          >
            Shadow Open Buddy Project · 2026
          </Typography>
          <Typography
            variant="body"
            className="opacity-30 italic text-sm text-text-muted leading-relaxed font-bold"
          >
            Engineered with high-fidelity glassmorphism and digital midnight aesthetics for the next
            generation of social workspaces.
          </Typography>
        </div>
      </footer>
    </div>
  )
}

export default App
