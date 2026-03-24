import { 
  Button, Card, CardHeader, Input, TextArea, Select, Switch,
  Avatar, AvatarGroup, Badge, Progress, Spinner, Tabs, ServerPill 
} from './components';
import { 
  Rocket, Layers, Send
} from 'lucide-react';

function App() {
  const colorVariants = ['cyan', 'pink', 'green', 'yellow', 'purple'] as const;

  return (
    <div className="gallery-container">
      <header className="gallery-header">
        <h1 className="gallery-title">Shadow <span>Design System</span></h1>
        <p className="gallery-subtitle">Component Gallery - All Variants</p>
      </header>

      {/* Buttons */}
      <section className="gallery-section">
        <h2 className="section-title">Buttons</h2>
        <div className="section-grid">
          {colorVariants.map((color) => (
            <div key={color} className="component-card">
              <div className="component-header">
                <span className="component-name">Button</span>
                <span className="component-variant">{color}</span>
              </div>
              <div className="component-preview">
                <Button variant={color}>{color}</Button>
                <Button variant={color} icon={Rocket}>Icon</Button>
              </div>
              <div className="component-code">{`<Button variant="${color}">`}</div>
            </div>
          ))}
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Button</span>
              <span className="component-variant">secondary</span>
            </div>
            <div className="component-preview">
              <Button variant="secondary">Secondary</Button>
            </div>
            <div className="component-code">{`<Button variant="secondary">`}</div>
          </div>
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Button</span>
              <span className="component-variant">sizes</span>
            </div>
            <div className="component-preview">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <div className="component-code">{`<Button size="sm|md|lg">`}</div>
          </div>
        </div>
      </section>

      {/* Cards */}
      <section className="gallery-section">
        <h2 className="section-title">Cards</h2>
        <div className="section-grid">
          {colorVariants.map((color) => (
            <div key={color} className="component-card">
              <div className="component-header">
                <span className="component-name">Card</span>
                <span className="component-variant">{color}</span>
              </div>
              <div className="component-preview">
                <Card variant={color} style={{ width: '100%' }}>
                  <CardHeader 
                    icon={<Layers size={20} />} 
                    title="Card Title" 
                    subtitle="Card description" 
                  />
                </Card>
              </div>
              <div className="component-code">{`<Card variant="${color}">`}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Inputs */}
      <section className="gallery-section">
        <h2 className="section-title">Inputs</h2>
        <div className="section-grid">
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Input</span>
              <span className="component-variant">default</span>
            </div>
            <div className="component-preview" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <Input placeholder="Enter text..." />
              <Input placeholder="With hint" hint="This is a hint" />
            </div>
            <div className="component-code">{`<Input placeholder="..." />`}</div>
          </div>
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Input</span>
              <span className="component-variant">error</span>
            </div>
            <div className="component-preview" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <Input placeholder="Error state" error="This field is required" />
            </div>
            <div className="component-code">{`<Input error="..." />`}</div>
          </div>
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">TextArea</span>
              <span className="component-variant">default</span>
            </div>
            <div className="component-preview" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <TextArea placeholder="Enter long text..." rows={3} />
            </div>
            <div className="component-code">{`<TextArea rows={3} />`}</div>
          </div>
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Select</span>
              <span className="component-variant">default</span>
            </div>
            <div className="component-preview" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <Select 
                placeholder="Select option"
                options={[
                  { value: '1', label: 'Option 1' },
                  { value: '2', label: 'Option 2' },
                  { value: '3', label: 'Option 3' },
                ]}
              />
            </div>
            <div className="component-code">{`<Select options={[...]} />`}</div>
          </div>
        </div>
      </section>

      {/* Switch */}
      <section className="gallery-section">
        <h2 className="section-title">Switch</h2>
        <div className="section-grid">
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Switch</span>
              <span className="component-variant">on/off</span>
            </div>
            <div className="component-preview">
              <Switch checked={true} label="Enabled" />
              <Switch checked={false} label="Disabled" />
            </div>
            <div className="component-code">{`<Switch checked={true} />`}</div>
          </div>
        </div>
      </section>

      {/* Avatar */}
      <section className="gallery-section">
        <h2 className="section-title">Avatar</h2>
        <div className="section-grid">
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Avatar</span>
              <span className="component-variant">colors</span>
            </div>
            <div className="component-preview">
              {colorVariants.map((color) => (
                <Avatar key={color} name="A" color={color} />
              ))}
            </div>
            <div className="component-code">{`<Avatar name="A" color="cyan" />`}</div>
          </div>
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Avatar</span>
              <span className="component-variant">sizes</span>
            </div>
            <div className="component-preview">
              <Avatar name="S" size="sm" />
              <Avatar name="M" size="md" />
              <Avatar name="L" size="lg" />
            </div>
            <div className="component-code">{`<Avatar size="sm|md|lg" />`}</div>
          </div>
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">AvatarGroup</span>
              <span className="component-variant">stacked</span>
            </div>
            <div className="component-preview">
              <AvatarGroup>
                <Avatar name="A" color="cyan" />
                <Avatar name="B" color="pink" />
                <Avatar name="C" color="green" />
                <Avatar name="D" color="yellow" />
              </AvatarGroup>
            </div>
            <div className="component-code">{`<AvatarGroup>...</AvatarGroup>`}</div>
          </div>
        </div>
      </section>

      {/* Badge */}
      <section className="gallery-section">
        <h2 className="section-title">Badge</h2>
        <div className="section-grid">
          {colorVariants.map((color) => (
            <div key={color} className="component-card">
              <div className="component-header">
                <span className="component-name">Badge</span>
                <span className="component-variant">{color}</span>
              </div>
              <div className="component-preview">
                <Badge variant={color}>{color.toUpperCase()}</Badge>
              </div>
              <div className="component-code">{`<Badge variant="${color}">`}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Progress */}
      <section className="gallery-section">
        <h2 className="section-title">Progress</h2>
        <div className="section-grid">
          {colorVariants.map((color) => (
            <div key={color} className="component-card">
              <div className="component-header">
                <span className="component-name">Progress</span>
                <span className="component-variant">{color}</span>
              </div>
              <div className="component-preview" style={{ flexDirection: 'column', width: '100%' }}>
                <Progress value={75} variant={color} />
                <Progress value={45} variant={color} size="sm" />
              </div>
              <div className="component-code">{`<Progress value={75} variant="${color}" />`}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Spinner */}
      <section className="gallery-section">
        <h2 className="section-title">Spinner</h2>
        <div className="section-grid">
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Spinner</span>
              <span className="component-variant">sizes</span>
            </div>
            <div className="component-preview">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </div>
            <div className="component-code">{`<Spinner size="md" />`}</div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="gallery-section">
        <h2 className="section-title">Tabs</h2>
        <div className="section-grid">
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">Tabs</span>
              <span className="component-variant">default</span>
            </div>
            <div className="component-preview">
              <Tabs 
                tabs={[
                  { id: 'all', label: 'All' },
                  { id: 'online', label: 'Online' },
                  { id: 'offline', label: 'Offline' },
                ]}
              />
            </div>
            <div className="component-code">{`<Tabs tabs={[...]} />`}</div>
          </div>
        </div>
      </section>

      {/* ServerPill */}
      <section className="gallery-section">
        <h2 className="section-title">ServerPill</h2>
        <div className="section-grid">
          <div className="component-card">
            <div className="component-header">
              <span className="component-name">ServerPill</span>
              <span className="component-variant">states</span>
            </div>
            <div className="component-preview">
              <ServerPill label="S1" active />
              <ServerPill label="S2" />
              <ServerPill label="S3" />
              <ServerPill label="+" />
            </div>
            <div className="component-code">{`<ServerPill label="S1" active />`}</div>
          </div>
        </div>
      </section>

      {/* Combined Example */}
      <section className="gallery-section">
        <h2 className="section-title">Combined Example - Chat UI</h2>
        <div className="component-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="component-header">
            <span className="component-name">Chat Interface</span>
            <span className="component-variant">combined</span>
          </div>
          <div className="component-preview" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <ServerPill label="S1" active />
              <ServerPill label="S2" />
              <ServerPill label="S3" />
            </div>
            <Card variant="cyan">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar name="A" color="cyan" size="sm" />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--cyan)' }}>Alex</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Hey everyone! 🎮</div>
                </div>
                <Badge variant="green" style={{ marginLeft: 'auto' }}>ONLINE</Badge>
              </div>
            </Card>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Input placeholder="Type a message..." style={{ flex: 1 }} />
              <Button variant="cyan" icon={Send}>Send</Button>
            </div>
          </div>
          <div className="component-code">Combined components example</div>
        </div>
      </section>

    </div>
  );
}

export default App;
