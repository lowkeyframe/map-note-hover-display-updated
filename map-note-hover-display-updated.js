const MODULE_NAME = "map-note-hover-display-updated"
const ELEMENT_ID = "map-note-hover-display-updated"

class MapNoteHoverDisplay extends foundry.applications.api.ApplicationV2 {
  constructor(options = {}) {
    super(options)
    this.note = null
    this.clearTimeout = null
  }

  static DEFAULT_OPTIONS = {
    id: ELEMENT_ID,
    classes: [ELEMENT_ID],
    tag: "div",
    window: {
      frame: false,
      positioned: false,
    },
    position: {
      width: "auto",
      height: "auto",
    },
  }

  static PARTS = {
    display: {
      id: "content",
      template: "modules/map-note-hover-display-updated/template.html",
    },
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options)
    
    if (!this.note?.entry) return context

    const entry = this.note.entry
    
    // Get the specific page if pageId is set, otherwise get the first page
    let page = null
    const pageId = this.note.document?.pageId
    
    if (pageId) {
      page = entry.pages.get(pageId)
    }
    
    if (!page) {
      page = entry.pages?.contents?.[0]
    }
    
    if (!page) return context
    
    const content = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      page.text?.content || "", 
      {
        secrets: page.testUserPermission(game.user, "OWNER"),
        async: true,
      }
    )

    context.title = page.name || entry.name
    context.body = content

    return context
  }

  async bind(note) {
    // Clear any pending clear timeout
    if (this.clearTimeout) {
      clearTimeout(this.clearTimeout)
      this.clearTimeout = null
    }
    
    this.note = note
    await this.render(true, { force: true })
    
    // Make sure it's visible
    if (this.element) {
      this.element.style.display = "block"
    }
  }

  async clear() {
    // Clear any existing timeout
    if (this.clearTimeout) {
      clearTimeout(this.clearTimeout)
    }
    
    // Add a small delay before actually clearing
    this.clearTimeout = setTimeout(() => {
      this.note = null
      
      // Hide the element instead of removing it
      if (this.element) {
        this.element.style.display = "none"
      }
      
      this.clearTimeout = null
    }, 50) // 50ms delay for snappier response
  }

  clearImmediate() {
    // Clear any pending timeout
    if (this.clearTimeout) {
      clearTimeout(this.clearTimeout)
      this.clearTimeout = null
    }
    
    this.note = null
    
    // Hide the element immediately
    if (this.element) {
      this.element.style.display = "none"
    }
  }

  async _renderHTML(context, options) {
    try {
      const template = this.constructor.PARTS.display.template
      const html = await foundry.applications.handlebars.renderTemplate(template, context)
      return { display: html }
    } catch (error) {
      console.error("MapNoteHoverDisplay: Error rendering template:", error)
      const fallbackHtml = `
        <div id="header">
          <h1>${context.title}</h1>
        </div>
        <div id="content">${context.body}</div>
      `
      return { display: fallbackHtml }
    }
  }

  _replaceHTML(result, content, options) {
    if (result && result.display) {
      content.innerHTML = result.display
    }
  }

  _onRender(context, options) {
    super._onRender(context, options)
    requestAnimationFrame(() => this._positionHUD())
  }

  _positionHUD() {
    if (!this.note || !this.element) return

    const fontSize = game.settings.get(MODULE_NAME, "fontSize") || canvas.grid.size / 5 + "px"
    const darkMode = game.settings.get(MODULE_NAME, "darkMode")
    const maxWidth = game.settings.get(MODULE_NAME, "maxWidth")

    // Get screen position from the note's global position
    const globalPos = this.note.getGlobalPosition()
    const screenX = globalPos.x
    const screenY = globalPos.y
    
    const viewportWidth = window.innerWidth
    const mapNoteIconWidth = this.note.controlIcon?.width || 40
    const mapNoteIconHeight = this.note.controlIcon?.height || 40
    
    // Determine if we should show on left or right of the note
    const orientation = screenX < viewportWidth / 2 ? "right" : "left"

    // Apply styles
    Object.assign(this.element.style, {
      background: darkMode ? `url("./ui/denim075.png") repeat` : "white",
      border: darkMode
        ? "1px solid var(--color-border-dark)"
        : "1px solid var(--color-border-light-primary)",
      borderRadius: "5px",
      boxShadow: "0 0 20px var(--color-shadow-dark)",
      padding: "10px",
      width: "auto",
      maxWidth: `${maxWidth}px`,
      height: "auto",
      top: `${screenY - mapNoteIconHeight / 2}px`,
      left:
        orientation === "right"
          ? `${screenX + mapNoteIconWidth}px`
          : `${screenX - mapNoteIconWidth}px`,
      transform: orientation === "right" ? "" : "translateX(-100%)",
      overflowWrap: "break-word",
      textAlign: "left",
      fontSize: fontSize,
      color: darkMode ? "var(--color-text-light-highlight)" : "var(--color-text-dark-primary)",
      pointerEvents: "none",
      position: "fixed",
      zIndex: "100",
      display: "block",
    })
  }
}

function registerSettings() {
  game.settings.register(MODULE_NAME, "enabled", {
    name: "Show map note hover display",
    hint: "Display the journal entry for a map note when it's hovered",
    scope: "client",
    type: Boolean,
    default: false,
    config: true,
  })
  game.settings.register(MODULE_NAME, "darkMode", {
    name: "Dark Mode",
    hint: "Show with light text on a dark background",
    scope: "client",
    type: Boolean,
    default: true,
    config: true,
  })
  game.settings.register(MODULE_NAME, "fontSize", {
    name: "Text size override",
    hint: "Override the base text size for the journal entry display. Example: 1.5rem.",
    scope: "client",
    type: String,
    default: "",
    config: true,
  })
  game.settings.register(MODULE_NAME, "maxWidth", {
    name: "Maximum Width",
    hint: "The maximum width the entry display can grow to before it'll force wrapping.",
    scope: "client",
    type: Number,
    default: 800,
    config: true,
  })
}

Hooks.once("init", () => {
  registerSettings()
})

Hooks.once("ready", () => {
  if (!canvas.hud) canvas.hud = {}
  canvas.hud.mapNoteHoverDisplay = new MapNoteHoverDisplay()
})

Hooks.on("hoverNote", (note, hovered) => {
  if (game.settings.get(MODULE_NAME, "enabled")) {
    // If the note is hovered by the mouse cursor (not via alt/option)
    if (hovered && note.mouseInteractionManager?.state === 1) {
      canvas.hud.mapNoteHoverDisplay?.bind(note)
    } else {
      canvas.hud.mapNoteHoverDisplay?.clear()
    }
  }
})

Hooks.on("deleteNote", (noteDocument, options, userId) => {
  console.log("Note deleted:", noteDocument)
  // Always clear the display when any note is deleted
  canvas.hud.mapNoteHoverDisplay?.clearImmediate()
})

Hooks.on("canvasReady", () => {
  // Clear display when canvas changes (switching scenes, etc)
  canvas.hud.mapNoteHoverDisplay?.clearImmediate()
})