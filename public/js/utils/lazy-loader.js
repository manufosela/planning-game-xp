/**
 * Lazy Loading System for Lit Components
 * Loads components only when they're about to be needed
 */
export class LazyLoader {
  static _loadedComponents = new Set();
  static _loadingPromises = new Map();
  static _observers = new Map();
  static _componentMap = {
    // Core components - npm packages
    // Note: 'app-modal' is imported statically in main.js, do not add here
    'slide-notification': '/js/wc/SlideNotification.js',
    'multi-select': '@manufosela/multi-select',

    // Core components - local
    'notification-bell': '/js/wc/NotificationBell.js',
    'quick-access-icons': '/js/wc/QuickAccessIcons.js',

    // Card components - load on demand
    'task-card': '/js/wc/TaskCard.js',
    'bug-card': '/js/wc/BugCard.js',
    'epic-card': '/js/wc/EpicCard.js',
    'sprint-card': '/js/wc/SprintCard.js',
    'qa-card': '/js/wc/QACard.js',
    'proposal-card': '/js/wc/ProposalCard.js',
    'bug-filters': '/js/wc/BugFilters.js',
    'task-filters': '/js/wc/TaskFilters.js',

    // Complex components - load on intersection
    'gantt-chart': '/js/wc/GanttChart.js',
    'sprint-points-chart': '/js/wc/SprintPointsChart.js',
    'project-form': '/js/wc/ProjectForm.js',

    // Utility components
    'firebase-storage-uploader': '/js/wc/FirebaseStorageUploader.js',
    'project-selector': '/js/wc/ProjectSelector.js'
  };

  /**
   * Initialize lazy loading system
   */
  static init() {
    // Load core components immediately
    this._loadCoreComponents();
    
    // Setup intersection observer for lazy loading
    this._setupIntersectionObserver();
    
    // Setup mutation observer for dynamically added elements
    this._setupMutationObserver();
}

  /**
   * Load core components that are needed immediately
   */
  static async _loadCoreComponents() {
    // Note: 'app-modal' is imported statically in main.js
    const coreComponents = ['slide-notification', 'notification-bell'];

    await Promise.all(coreComponents.map(component => this.loadComponent(component)));
}

  /**
   * Setup intersection observer for viewport-based loading
   */
  static _setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const tagName = entry.target.tagName.toLowerCase();
          this.loadComponent(tagName);
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '100px', // Load 100px before element enters viewport
      threshold: 0.1
    });

    this._observers.set('intersection', observer);
  }

  /**
   * Setup mutation observer for dynamically added elements
   */
  static _setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this._processElement(node);
            
            // Process child elements
            const children = node.querySelectorAll ? node.querySelectorAll('*') : [];
            children.forEach(child => this._processElement(child));
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this._observers.set('mutation', observer);
  }

  /**
   * Process element for lazy loading
   */
  static _processElement(element) {
    const tagName = element.tagName?.toLowerCase();
    
    if (this._componentMap[tagName] && !this._loadedComponents.has(tagName)) {
      // For card components, use intersection observer
      if (this._isCardComponent(tagName)) {
        this._observers.get('intersection')?.observe(element);
      } else {
        // Load immediately for utility components
        this.loadComponent(tagName);
      }
    }
  }

  /**
   * Check if component is a card component
   */
  static _isCardComponent(tagName) {
    return tagName.includes('-card') || tagName === 'task-filters';
  }

  /**
   * Load a specific component
   */
  static async loadComponent(componentName) {
    if (this._loadedComponents.has(componentName)) {
      return true;
    }

    // Check if component is already registered (loaded by static import)
    if (customElements.get(componentName)) {
      this._loadedComponents.add(componentName);
      return true;
    }

    if (this._loadingPromises.has(componentName)) {
      return this._loadingPromises.get(componentName);
    }

    const componentPath = this._componentMap[componentName];
    if (!componentPath) {
      console.warn(`⚠️ LazyLoader: Unknown component '${componentName}'`);
      return false;
    }

    const loadPromise = this._loadComponentScript(componentPath, componentName);
    this._loadingPromises.set(componentName, loadPromise);

    try {
      await loadPromise;
      this._loadedComponents.add(componentName);
      this._loadingPromises.delete(componentName);
return true;
    } catch (error) {
      this._loadingPromises.delete(componentName);
      console.error(`❌ LazyLoader: Failed to load '${componentName}':`, error);
      return false;
    }
  }

  /**
   * Load component script immediately (removed requestIdleCallback delay)
   */
  static async _loadComponentScript(path, componentName) {
    await import(path);
    // Dispatch event for component loaded
    document.dispatchEvent(new CustomEvent('component-lazy-loaded', {
      detail: { componentName, path }
    }));
  }

  /**
   * Preload components that are likely to be needed
   */
  static async preloadComponents(componentNames) {
await Promise.all(
      componentNames.map(name => this.loadComponent(name))
    );
  }

  /**
   * Load components for specific page
   */
  static async loadPageComponents(pageName) {
    const pageComponents = {
      'dashboard': ['task-card', 'bug-card', 'task-filters', 'epic-card'],
      'adminproject': ['project-form', 'multi-select'],
      'sprintview': ['sprint-card', 'gantt-chart', 'sprint-points-chart'],
      'index': ['project-selector']
    };

    const components = pageComponents[pageName] || [];
    if (components.length > 0) {
// Force immediate loading for critical dashboard components
      if (pageName === 'dashboard') {
        await Promise.all(components.map(name => this._loadComponentImmediate(name)));
      } else {
        await this.preloadComponents(components);
      }
    }
  }
  
  /**
   * Load component immediately without lazy loading delays
   */
  static async _loadComponentImmediate(componentName) {
    if (this._loadedComponents.has(componentName)) {
      return true;
    }

    if (this._loadingPromises.has(componentName)) {
      return this._loadingPromises.get(componentName);
    }

    const componentPath = this._componentMap[componentName];
    if (!componentPath) {
      console.warn(`⚠️ LazyLoader: Unknown component '${componentName}'`);
      return false;
    }

    const loadPromise = import(componentPath);
    this._loadingPromises.set(componentName, loadPromise);

    try {
      await loadPromise;
      this._loadedComponents.add(componentName);
      this._loadingPromises.delete(componentName);
return true;
    } catch (error) {
      this._loadingPromises.delete(componentName);
      console.error(`❌ LazyLoader: Failed to load '${componentName}':`, error);
      return false;
    }
  }

  /**
   * Get loading status
   */
  static getStatus() {
    return {
      loaded: Array.from(this._loadedComponents),
      loading: Array.from(this._loadingPromises.keys()),
      total: Object.keys(this._componentMap).length
    };
  }

  /**
   * Cleanup observers
   */
  static cleanup() {
    this._observers.forEach(observer => observer.disconnect());
    this._observers.clear();
}
}

// Auto-initialize on every page load (View Transitions compatible)
document.addEventListener('astro:page-load', () => LazyLoader.init());

window.LazyLoader = LazyLoader;
