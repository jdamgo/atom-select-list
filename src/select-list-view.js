/** @babel */
/** @jsx etch.dom */

const {Disposable, CompositeDisposable, TextEditor} = require('atom')
const etch = require('etch')
const fuzzaldrin = require('fuzzaldrin')
const path = require('path')

module.exports = class SelectListView {
  constructor (props) {
    this.props = props
    this.computeItems()
    this.selectionIndex = 0
    this.disposables = new CompositeDisposable()
    etch.initialize(this)
    this.element.classList.add('select-list')
    this.disposables.add(this.refs.queryEditor.onDidChange(this.didChangeQuery.bind(this)))
    if (!props.skipCommandsRegistration) {
      this.disposables.add(this.registerAtomCommands())
    }
    const editorElement = this.refs.queryEditor.element
    const didLoseFocus = this.didLoseFocus.bind(this)
    editorElement.addEventListener('blur', didLoseFocus)
    this.disposables.add(new Disposable(() => { editorElement.removeEventListener('blur', didLoseFocus) }))
  }

  focus () {
    this.refs.queryEditor.element.focus()
  }

  didLoseFocus (event) {
    if (this.element.contains(event.relatedTarget)) {
      this.refs.queryEditor.element.focus()
    } else {
      this.cancelSelection()
    }
  }

  reset () {
    this.refs.queryEditor.setText('')
  }

  destroy () {
    this.disposables.dispose()
    return etch.destroy(this)
  }

  registerAtomCommands () {
    return global.atom.commands.add(this.element, {
      'core:move-up': (event) => {
        this.selectPrevious()
        event.stopPropagation()
      },
      'core:move-down': (event) => {
        this.selectNext()
        event.stopPropagation()
      },
      'core:move-to-top': (event) => {
        this.selectFirst()
        event.stopPropagation()
      },
      'core:move-to-bottom': (event) => {
        this.selectLast()
        event.stopPropagation()
      },
      'core:confirm': (event) => {
        this.confirmSelection()
        event.stopPropagation()
      },
      'core:cancel': (event) => {
        this.cancelSelection()
        event.stopPropagation()
      }
    })
  }

  update (props = {}) {
    let shouldComputeItems = false

    if (props.hasOwnProperty('items')) {
      this.props.items = props.items
      shouldComputeItems = true
    }

    if (props.hasOwnProperty('maxResults')) {
      this.props.maxResults = props.maxResults
      shouldComputeItems = true
    }

    if (props.hasOwnProperty('filter')) {
      this.props.filter = props.filter
      shouldComputeItems = true
    }

    if (props.hasOwnProperty('filterQuery')) {
      this.props.filterQuery = props.filterQuery
      shouldComputeItems = true
    }

    if (props.hasOwnProperty('order')) {
      this.props.order = props.order
    }

    if (props.hasOwnProperty('emptyMessage')) {
      this.props.emptyMessage = props.emptyMessage
    }

    if (props.hasOwnProperty('errorMessage')) {
      this.props.errorMessage = props.errorMessage
    }

    if (props.hasOwnProperty('infoMessage')) {
      this.props.infoMessage = props.infoMessage
    }

    if (props.hasOwnProperty('loadingMessage')) {
      this.props.loadingMessage = props.loadingMessage
    }

    if (props.hasOwnProperty('apmMessage')) {
      this.props.apmMessage = props.apmMessage
    }

    if (props.hasOwnProperty('loadingBadge')) {
      this.props.loadingBadge = props.loadingBadge
    }

    if (props.hasOwnProperty('itemsClassList')) {
      this.props.itemsClassList = props.itemsClassList
    }

    if (shouldComputeItems) {
      this.computeItems()
    }

    return etch.update(this)
  }

  render () {
    return (
      <div>
        <TextEditor ref='queryEditor' mini={true} />
        {this.renderLoadingMessage()}
        {this.renderInfoMessage()}
        {this.renderErrorMessage()}
        {this.renderItems()}
      </div>
    )
  }

  renderItems () {
    const query = this.getQuery()
    // NOTE Performance test for chosen query check: http://jsben.ch/#/uhhWM
    if(query[0] === 'a' && query.startsWith('pm ', 1)) {
      return (
        <span ref="apmMessage">{this.props.apmMessage}</span>
      )
    } else if (this.items.length > 0) {
      const className = ['list-group'].concat(this.props.itemsClassList || []).join(' ')
      return (
        <ol className={className} ref='items'>
        {this.items.map((item, index) =>
          <ListItemView
            element={this.props.elementForItem(item)}
            selected={this.getSelectedItem() === item}
            onclick={() => this.didClickItem(index)} />)}
        </ol>
      )
    } else if (!this.props.loadingMessage) {
      return (
        <span ref="emptyMessage">{this.props.emptyMessage}</span>
      )
    } else {
      return ""
    }
  }

  renderErrorMessage () {
    if (this.props.errorMessage) {
      return <span ref="errorMessage">{this.props.errorMessage}</span>
    } else {
      return ''
    }
  }

  renderInfoMessage () {
    if (this.props.infoMessage) {
      return <span ref="infoMessage">{this.props.infoMessage}</span>
    } else {
      return ''
    }
  }

  renderLoadingMessage () {
    if (this.props.loadingMessage) {
      return (
        <div className="loading">
          <span ref="loadingMessage" className="loading-message">{this.props.loadingMessage}</span>
          {this.props.loadingBadge ? <span ref="loadingBadge" className="badge">{this.props.loadingBadge}</span> : ""}
        </div>
      )
    } else {
      return ''
    }
  }

  getQuery () {
    if (this.refs && this.refs.queryEditor) {
      return this.refs.queryEditor.getText()
    } else {
      return ""
    }
  }

  getFilterQuery () {
    return this.props.filterQuery ? this.props.filterQuery(this.getQuery()) : this.getQuery()
  }

  didChangeQuery () {
    if (this.props.didChangeQuery) {
      this.props.didChangeQuery(this.getFilterQuery())
    }

    this.computeItems()
    this.selectIndex(0)
  }

  didClickItem (itemIndex) {
    this.selectIndex(itemIndex)
    this.confirmSelection()
  }

  computeItems () {
    const filterFn = this.props.filter || this.fuzzyFilter.bind(this)
    this.items = filterFn(this.props.items.slice(), this.getFilterQuery())
    if (this.props.order) {
      this.items.sort(this.props.order)
    }
    if (this.props.maxResults) {
      this.items.splice(this.props.maxResults, this.items.length - this.props.maxResults)
    }
  }

  fuzzyFilter (items, query) {
    if (query.length === 0) {
      return items
    } else {
      const scoredItems = []
      for (const item of items) {
        const string = this.props.filterKeyForItem ? this.props.filterKeyForItem(item) : item
        let score = fuzzaldrin.score(string, query)
        if (score > 0) {
          scoredItems.push({item, score})
        }
      }
      scoredItems.sort((a, b) => b.score - a.score)
      return scoredItems.map((i) => i.item)
    }
  }

  getSelectedItem () {
    return this.items[this.selectionIndex]
  }

  selectPrevious () {
    return this.selectIndex(this.selectionIndex - 1)
  }

  selectNext () {
    return this.selectIndex(this.selectionIndex + 1)
  }

  selectFirst () {
    return this.selectIndex(0)
  }

  selectLast () {
    return this.selectIndex(this.items.length - 1)
  }

  selectIndex (index) {
    if (index >= this.items.length) {
      index = 0
    } else if (index < 0) {
      index = this.items.length - 1
    }

    if (index !== this.selectionIndex) {
      this.selectionIndex = index
      if (this.props.didChangeSelection) {
        this.props.didChangeSelection(this.getSelectedItem())
      }
    }

    return etch.update(this)
  }

  selectItem (item) {
    const index = this.items.indexOf(item)
    if (index === -1) {
      throw new Error('Cannot select the specified item because it does not exist.')
    } else {
      return this.selectIndex(index)
    }
  }

  confirmSelection () {
    const selectedItem = this.getSelectedItem()
    if (selectedItem) {
      if (this.props.didConfirmSelection) {
        this.props.didConfirmSelection(selectedItem)
      }
    } else if (this.getQuery().startsWith('apm')) {
      if (this.props.didConfirmApmCommand) {
        this.props.didConfirmApmCommand(this.getQuery())
      }
    } else {
      if (this.props.didConfirmEmptySelection) {
        this.props.didConfirmEmptySelection()
      }
    }
  }

  cancelSelection () {
    if (this.props.didCancelSelection) {
      this.props.didCancelSelection()
    }
  }
}

class ListItemView {
  constructor (props) {
    this.mouseDown = this.mouseDown.bind(this)
    this.mouseUp = this.mouseUp.bind(this)
    this.didClick = this.didClick.bind(this)
    this.selected = props.selected
    this.onclick = props.onclick
    this.element = props.element
    this.element.addEventListener('mousedown', this.mouseDown)
    this.element.addEventListener('mouseup', this.mouseUp)
    this.element.addEventListener('click', this.didClick)
    if (this.selected) {
      this.element.classList.add('selected')
    }
    this.domEventsDisposable = new Disposable(() => {
      this.element.removeEventListener('mousedown', this.mouseDown)
      this.element.removeEventListener('mouseup', this.mouseUp)
      this.element.removeEventListener('click', this.didClick)
    })
    etch.getScheduler().updateDocument(this.scrollIntoViewIfNeeded.bind(this))
  }

  mouseDown (event) {
    event.preventDefault()
  }

  mouseUp () {
    event.preventDefault()
  }

  didClick (event) {
    event.preventDefault()
    this.onclick()
  }

  destroy () {
    if (this.selected) {
      this.element.classList.remove('selected')
    }
    this.domEventsDisposable.dispose()
  }

  update (props) {
    if (this.element !== props.element) {
      this.element.removeEventListener('mousedown', this.mouseDown)
      props.element.addEventListener('mousedown', this.mouseDown)
      this.element.removeEventListener('mouseup', this.mouseUp)
      props.element.addEventListener('mouseup', this.mouseUp)
      this.element.removeEventListener('click', this.didClick)
      props.element.addEventListener('click', this.didClick)

      props.element.classList.remove('selected')
      if (props.selected) {
        props.element.classList.add('selected')
      }
    } else {
      if (this.selected && !props.selected) {
        this.element.classList.remove('selected')
      } else if (!this.selected && props.selected) {
        this.element.classList.add('selected')
      }
    }

    this.element = props.element
    this.selected = props.selected
    this.onclick = props.onclick
    etch.getScheduler().updateDocument(this.scrollIntoViewIfNeeded.bind(this))
  }

  scrollIntoViewIfNeeded () {
    if (this.selected) {
      this.element.scrollIntoViewIfNeeded()
    }
  }
}
