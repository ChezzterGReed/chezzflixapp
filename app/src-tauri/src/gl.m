// A layer-below-the-webview NSView backed by an OpenGL context. libmpv draws video frames into it
// (via its render API); the transparent web UI is composited on top.
#import <Cocoa/Cocoa.h>
#import <OpenGL/OpenGL.h>
#import <OpenGL/gl3.h>
#include <dlfcn.h>

@interface ChezzGLView : NSView {
@public
    NSOpenGLContext *ctx;
    volatile int pw;
    volatile int ph;
}
- (void)updateSize;
@end

@implementation ChezzGLView
- (BOOL)isOpaque { return YES; }
- (BOOL)acceptsFirstResponder { return NO; }
// Never swallow mouse events: the webview above handles all input.
- (NSView *)hitTest:(NSPoint)p { return nil; }

- (void)updateSize {
    NSRect b = [self convertRectToBacking:self.bounds];
    pw = (int)b.size.width;
    ph = (int)b.size.height;
    if (ctx) {
        CGLLockContext(ctx.CGLContextObj);
        [ctx update];
        CGLUnlockContext(ctx.CGLContextObj);
    }
}
- (void)setFrameSize:(NSSize)s { [super setFrameSize:s]; [self updateSize]; }
- (void)viewDidChangeBackingProperties { [super viewDidChangeBackingProperties]; [self updateSize]; }
- (void)viewDidMoveToWindow { [super viewDidMoveToWindow]; [self updateSize]; }
@end

// Must be called on the main thread. `parent` is the window's content NSView.
void *chezz_gl_create(void *parent_ptr) {
    NSView *parent = (__bridge NSView *)parent_ptr;
    NSOpenGLPixelFormatAttribute attrs[] = {
        NSOpenGLPFAOpenGLProfile, NSOpenGLProfileVersion3_2Core,
        NSOpenGLPFADoubleBuffer, NSOpenGLPFAAccelerated, NSOpenGLPFAColorSize, 32, 0};
    NSOpenGLPixelFormat *pf = [[NSOpenGLPixelFormat alloc] initWithAttributes:attrs];
    if (!pf) return NULL;

    ChezzGLView *v = [[ChezzGLView alloc] initWithFrame:parent.bounds];
    v.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [v setWantsBestResolutionOpenGLSurface:YES];
    // Sit at the very back of the stack: the (transparent) webview renders over it.
    [parent addSubview:v positioned:NSWindowBelow relativeTo:nil];

    NSOpenGLContext *c = [[NSOpenGLContext alloc] initWithFormat:pf shareContext:nil];
    if (!c) return NULL;
    GLint one = 1;
    [c setValues:&one forParameter:NSOpenGLContextParameterSwapInterval];
    [c setValues:&one forParameter:NSOpenGLContextParameterSurfaceOpacity];
    v->ctx = c;
    [c setView:v];
    [v updateSize];
    return (void *)CFBridgingRetain(v);
}

// Make the context current on the calling (render) thread and report the drawable size + FBO.
int chezz_gl_begin(void *h, int *w, int *hh, int *fbo) {
    ChezzGLView *v = (__bridge ChezzGLView *)h;
    CGLLockContext(v->ctx.CGLContextObj);
    [v->ctx makeCurrentContext];
    *w = v->pw;
    *hh = v->ph;
    GLint f = 0;
    glGetIntegerv(GL_FRAMEBUFFER_BINDING, &f);
    *fbo = f;
    return 1;
}

void chezz_gl_end(void *h, int present) {
    ChezzGLView *v = (__bridge ChezzGLView *)h;
    if (present) [v->ctx flushBuffer];
    CGLUnlockContext(v->ctx.CGLContextObj);
}

// Main thread.
void chezz_gl_destroy(void *h) {
    ChezzGLView *v = (__bridge_transfer ChezzGLView *)h;
    [v->ctx clearDrawable];
    [v removeFromSuperview];
}

void *chezz_gl_proc(const char *name) {
    static void *lib = NULL;
    if (!lib) lib = dlopen("/System/Library/Frameworks/OpenGL.framework/OpenGL", RTLD_LAZY);
    return lib ? dlsym(lib, name) : NULL;
}
