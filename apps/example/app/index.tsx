import {
  Chessboard,
  type BoardAnnotation,
  type PieceRenderer,
  type PieceRenderers,
} from '@vibechess/chessboard-native';
import { defaultPieceRenderers } from '@vibechess/chessboard-native/pieces';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  GALLERY_ROUTE_SECTIONS,
  galleryRouteHref,
} from '../src/gallery-routes';

const GuidePiece: PieceRenderer = ({ size }) => (
  <View
    style={[
      styles.guidePiece,
      { borderRadius: size / 2, height: size, width: size },
    ]}
  >
    <Text style={[styles.guidePieceText, { fontSize: size * 0.42 }]}>G</Text>
  </View>
);

const customPieceRenderers = Object.freeze({
  ...defaultPieceRenderers,
  guide: GuidePiece,
}) satisfies PieceRenderers;

const standardAnnotationSets = Object.freeze([
  Object.freeze([
    {
      color: 'rgba(238, 119, 0, 0.28)',
      id: 'center-fill',
      square: 'd4',
      type: 'square',
    },
    {
      color: '#e46f18',
      from: 'e2',
      id: 'king-pawn',
      to: 'e4',
      type: 'arrow',
    },
    {
      color: '#246bc2',
      from: 'b1',
      id: 'knight-path',
      to: 'c3',
      type: 'arrow',
    },
  ] satisfies readonly BoardAnnotation[]),
  Object.freeze([
    {
      color: '#2d8f58',
      from: 'c1',
      id: 'bishop-line',
      to: 'h6',
      type: 'arrow',
    },
    {
      color: '#8b4bc1',
      id: 'target-ring',
      shape: 'circle',
      square: 'h7',
      type: 'square',
    },
    {
      color: '#8b4bc1',
      from: 'h2',
      id: 'shared-target-one',
      to: 'h7',
      type: 'arrow',
    },
    {
      color: '#c14949',
      from: 'g2',
      id: 'shared-target-two',
      to: 'h7',
      type: 'arrow',
    },
  ] satisfies readonly BoardAnnotation[]),
]);

const variantAnnotations = Object.freeze([
  {
    color: 'rgba(35, 106, 91, 0.35)',
    id: 'guide-dot',
    shape: 'dot',
    square: 'c2',
    type: 'square',
  },
  {
    color: '#f4ecff',
    from: 'a1',
    id: 'variant-line',
    layer: 'belowPieces',
    to: 'e3',
    type: 'arrow',
  },
  {
    color: '#f2b84b',
    from: 'e3',
    id: 'variant-knight',
    to: 'd1',
    type: 'arrow',
  },
] satisfies readonly BoardAnnotation[]);

export default function GalleryIndex() {
  const [annotationSet, setAnnotationSet] = useState(0);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>EXPO GALLERY · PUBLIC CONTRACTS</Text>
          <Text accessibilityRole="header" style={styles.title}>
            chessboard-native
          </Text>
          <Text style={styles.description}>
            A rules-free, store-driven React Native chessboard. Choose a focused
            lab by public contract, then use the overview boards for rendering,
            annotation, orientation, rectangular-board, and custom-piece
            coverage.
          </Text>
        </View>

        <View style={styles.catalog}>
          {GALLERY_ROUTE_SECTIONS.map((section) => (
            <View key={section.id} style={styles.catalogSection}>
              <Text accessibilityRole="header" style={styles.catalogTitle}>
                {section.title}
              </Text>
              <Text style={styles.catalogDescription}>
                {section.description}
              </Text>
              <View style={styles.routeList}>
                {section.routes.map((route) => (
                  <Link key={route.name} asChild href={galleryRouteHref(route)}>
                    <Pressable
                      accessibilityHint={`Opens the ${route.title} lab`}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.routeCard,
                        pressed && styles.routeCardPressed,
                      ]}
                    >
                      <View style={styles.routeCopy}>
                        <Text style={styles.routeTitle}>{route.title}</Text>
                        <Text style={styles.routeDescription}>
                          {route.description}
                        </Text>
                      </View>
                      <Text
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                        style={styles.chevron}
                      >
                        ›
                      </Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.overviewHeading}>
          <Text accessibilityRole="header" style={styles.overviewTitle}>
            Overview boards
          </Text>
          <Text style={styles.overviewDescription}>
            Both boards render directly from their current props. Replacing the
            annotation set below never creates a second semantic source of
            truth.
          </Text>
        </View>

        <View style={styles.boardContainer}>
          <Chessboard
            annotations={standardAnnotationSets[annotationSet]}
            boardId="standard-white"
            position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
          />
        </View>

        <Text style={styles.caption}>
          Store-driven square, straight, knight, and shared-target annotation
          geometry · white orientation
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setAnnotationSet((current) => (current === 0 ? 1 : 0));
          }}
          style={styles.annotationToggle}
        >
          <Text style={styles.annotationToggleText}>
            Replace controlled annotation set
          </Text>
        </Pressable>

        <View style={styles.variantContainer}>
          <Chessboard
            annotations={variantAnnotations}
            boardId="custom-variant-black"
            dimensions={{ columns: 5, rows: 3 }}
            orientation="black"
            pieceRenderers={customPieceRenderers}
            position={{
              a1: { pieceType: 'wK' },
              c2: { id: 'custom-guide', pieceType: 'guide' },
              e3: { pieceType: 'bK' },
            }}
            squareStyles={{ c2: { backgroundColor: '#f2b84b' } }}
            styles={{
              board: { borderRadius: 12 },
              piece: { opacity: 0.94 },
            }}
            theme={{
              darkSquare: { backgroundColor: '#655374' },
              darkSquareNotation: { color: '#f4ecff' },
              lightSquare: { backgroundColor: '#ded1e8' },
              lightSquareNotation: { color: '#513f60' },
            }}
          />
        </View>

        <Text style={styles.caption}>
          Open “guide” piece type · explicit default spread · black 5×3 variant
          · canonical c2 style · oriented rectangular annotations
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f4ee',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  heading: {
    width: '100%',
    maxWidth: 520,
    marginBottom: 28,
  },
  eyebrow: {
    marginBottom: 8,
    color: '#665c4d',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#1e1b17',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
  },
  description: {
    marginTop: 12,
    color: '#665c4d',
    fontSize: 17,
    lineHeight: 25,
  },
  guidePiece: {
    alignItems: 'center',
    backgroundColor: '#236a5b',
    borderColor: '#d9fff5',
    borderWidth: 2,
    justifyContent: 'center',
  },
  guidePieceText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  annotationToggle: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    borderColor: '#236a5b',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  annotationToggleText: {
    color: '#236a5b',
    fontSize: 15,
    fontWeight: '700',
  },
  boardContainer: {
    width: '100%',
    maxWidth: 520,
  },
  catalog: {
    width: '100%',
    maxWidth: 520,
    gap: 28,
    marginBottom: 40,
  },
  catalogDescription: {
    color: '#766c5d',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  catalogSection: {
    width: '100%',
  },
  catalogTitle: {
    color: '#1e1b17',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  caption: {
    width: '100%',
    maxWidth: 520,
    marginTop: 18,
    color: '#766c5d',
    fontSize: 14,
    lineHeight: 21,
  },
  chevron: {
    color: '#236a5b',
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 32,
  },
  overviewDescription: {
    color: '#665c4d',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  overviewHeading: {
    width: '100%',
    maxWidth: 520,
    marginBottom: 20,
  },
  overviewTitle: {
    color: '#1e1b17',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  routeCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d8d0c3',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  routeCardPressed: {
    backgroundColor: '#eee8dd',
  },
  routeCopy: {
    flex: 1,
  },
  routeDescription: {
    color: '#665c4d',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  routeList: {
    gap: 10,
    marginTop: 14,
  },
  routeTitle: {
    color: '#236a5b',
    fontSize: 16,
    fontWeight: '700',
  },
  variantContainer: {
    width: '72%',
    maxWidth: 380,
    marginTop: 32,
  },
});
