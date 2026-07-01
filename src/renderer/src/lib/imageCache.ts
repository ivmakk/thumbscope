// Thumbnail transport is the `thumb://` custom protocol: <img src> points at it and Chromium's
// resource loader owns fetching, concurrency, priority, off-screen cancellation, and caching. No
// blob URLs / hand-managed cache here anymore - just the pure sync URL builder.
export { thumbUrl } from '../../../shared/thumbUrl'
