// 用法: swift squircle.swift <输入.png> <输出.png> <边长px>
// 输出透明背景的 macOS 圆角图标, 内容占画布 86% (与 Apple 官方 app 图标一致)
import AppKit

let args = CommandLine.arguments
let src = NSImage(contentsOfFile: args[1])!
let side = Double(args[3])!
let size = NSSize(width: side, height: side)
let img = NSImage(size: size)
img.lockFocus()
// 内容缩到 86%, 四周各留 7%
let inset = side * 0.07
let rect = NSRect(x: inset, y: inset, width: side - inset * 2, height: side - inset * 2)
// macOS 圆角矩形: 半径约为内容边长的 22.37%
let radius = rect.width * 0.2237
let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
NSGraphicsContext.current?.imageInterpolation = .high
path.addClip()
src.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1.0)
img.unlockFocus()
let tiff = img.tiffRepresentation!
let rep = NSBitmapImageRep(data: tiff)!
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: args[2]))
