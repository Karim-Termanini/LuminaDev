use crate::project_scaffold::ports::find_free_port;

pub(crate) fn scaffold_mobile_react_native(
    project_dir: &std::path::Path,
    env_vars: &[(&str, &str)],
) -> Result<(), String> {
    let w = |path: &str, content: &str| {
        std::fs::write(project_dir.join(path), content)
            .map_err(|e| format!("[SCAFFOLD_FAILED] write {path}: {e}"))
    };
    std::fs::create_dir_all(project_dir.join("android"))
        .map_err(|e| format!("[SCAFFOLD_FAILED] mkdir android: {e}"))?;
    std::fs::create_dir_all(project_dir.join("ios"))
        .map_err(|e| format!("[SCAFFOLD_FAILED] mkdir ios: {e}"))?;

    let package_json = serde_json::json!({
        "name": "lumina-mobile-app",
        "version": "0.0.1",
        "private": true,
        "scripts": {
            "android": "react-native run-android",
            "ios": "react-native run-ios",
            "start": "react-native start",
            "test": "jest"
        },
        "dependencies": {
            "react": "18.2.0",
            "react-native": "0.74.0",
            "@react-navigation/native": "^6.1.0",
            "@react-navigation/stack": "^6.3.0"
        },
        "devDependencies": {
            "@babel/core": "^7.20.0",
            "@babel/preset-env": "^7.20.0",
            "@babel/runtime": "^7.20.0",
            "@react-native/metro-config": "^0.74.0",
            "@types/react": "^18.0.24",
            "@types/react-native": "^0.72.0",
            "jest": "^29.0.0",
            "typescript": "5.0.4"
        },
        "jest": {
            "preset": "react-native"
        }
    });
    w(
        "package.json",
        &serde_json::to_string_pretty(&package_json).unwrap(),
    )?;

    w(
        "metro.config.js",
        r#"const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const config = {};
module.exports = mergeConfig(getDefaultConfig(__dirname), config);
"#,
    )?;

    w(
        "index.js",
        r#"import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './package.json';
AppRegistry.registerComponent(appName, () => App);
"#,
    )?;

    w(
        "App.tsx",
        r#"import React from 'react';
import {SafeAreaView, Text, StyleSheet} from 'react-native';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>LuminaDev Mobile App</Text>
      <Text style={styles.subtitle}>Edit App.tsx to get started.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e'},
  title: {fontSize: 24, fontWeight: 'bold', color: '#e0e0ff'},
  subtitle: {fontSize: 14, color: '#9090aa', marginTop: 8},
});
"#,
    )?;

    let mut env_content = String::new();
    for (k, v) in env_vars {
        env_content.push_str(&format!("{k}={v}\n"));
    }
    w(".env", &env_content)?;

    w(
        ".gitignore",
        "node_modules/\n.env\nbuild/\nandroid/app/build/\nios/build/\n*.jks\n*.keystore\n",
    )?;

    let appium_port = find_free_port(4723);
    let json_server_port = find_free_port(3001);
    w(
        "docker-compose.yml",
        &format!(
            r#"services:
  appium:
    image: appium/appium:latest
    ports:
      - "{appium_port}:4723"
    environment:
      - ANDROID_SDK_ROOT=/opt/android-sdk
  json-server:
    image: clue/json-server
    ports:
      - "{json_server_port}:80"
    volumes:
      - ./mock-data.json:/data/db.json
"#
        ),
    )?;

    w(
        "mock-data.json",
        r#"{"users": [], "posts": []}
"#,
    )?;

    w(
        "tsconfig.json",
        r#"{
  "extends": "@react-native/typescript-config/tsconfig.json"
}
"#,
    )?;

    Ok(())
}

pub(crate) fn scaffold_mobile_flutter(
    project_dir: &std::path::Path,
    env_vars: &[(&str, &str)],
) -> Result<(), String> {
    let w = |path: &str, content: &str| {
        if let Some(parent) = std::path::Path::new(path).parent() {
            let _ = std::fs::create_dir_all(project_dir.join(parent));
        }
        std::fs::write(project_dir.join(path), content)
            .map_err(|e| format!("[SCAFFOLD_FAILED] write {path}: {e}"))
    };

    w(
        "pubspec.yaml",
        r#"name: lumina_mobile_app
description: LuminaDev Flutter project
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'
  flutter: '>=3.0.0'

dependencies:
  flutter:
    sdk: flutter
  http: ^1.1.0
  provider: ^6.1.0
  go_router: ^12.0.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
"#,
    )?;

    w(
        "lib/main.dart",
        r#"import 'package:flutter/material.dart';

void main() {
  runApp(const LuminaApp());
}

class LuminaApp extends StatelessWidget {
  const LuminaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LuminaDev Flutter App',
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple)),
      home: const Scaffold(
        body: Center(
          child: Text('LuminaDev Flutter App', style: TextStyle(fontSize: 24)),
        ),
      ),
    );
  }
}
"#,
    )?;

    w(
        "test/widget_test.dart",
        r#"import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lumina_mobile_app/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const LuminaApp());
    expect(find.text('LuminaDev Flutter App'), findsOneWidget);
  });
}
"#,
    )?;

    let mut env_content = String::new();
    for (k, v) in env_vars {
        env_content.push_str(&format!("{k}={v}\n"));
    }
    w(".env", &env_content)?;

    w(
        ".gitignore",
        ".dart_tool/\n.flutter-plugins\n.flutter-plugins-dependencies\nbuild/\n.env\n",
    )?;

    w(
        "docker-compose.yml",
        r#"services:
  flutter-dev:
    image: cirrusci/flutter:stable
    working_dir: /app
    volumes:
      - .:/app
      - /tmp/.X11-unix:/tmp/.X11-unix
    command: flutter pub get
    environment:
      - DISPLAY=${DISPLAY}
"#,
    )?;

    w(
        "analysis_options.yaml",
        r#"include: package:flutter_lints/flutter.yaml
"#,
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaffold_rn_creates_expected_files() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_mobile_react_native(dir.path(), &[]).unwrap();
        assert!(dir.path().join("package.json").exists());
        assert!(dir.path().join("metro.config.js").exists());
        assert!(dir.path().join("index.js").exists());
        assert!(dir.path().join("App.tsx").exists());
        assert!(dir.path().join(".env").exists());
        assert!(dir.path().join(".gitignore").exists());
        assert!(dir.path().join("android").is_dir());
        assert!(dir.path().join("ios").is_dir());
    }

    #[test]
    fn scaffold_flutter_creates_expected_files() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_mobile_flutter(dir.path(), &[]).unwrap();
        assert!(dir.path().join("pubspec.yaml").exists());
        assert!(dir.path().join("lib/main.dart").exists());
        assert!(dir.path().join("test/widget_test.dart").exists());
        assert!(dir.path().join(".env").exists());
        assert!(dir.path().join("docker-compose.yml").exists());
    }

    #[test]
    fn scaffold_mobile_react_native_includes_tsconfig() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_mobile_react_native(dir.path(), &[]).unwrap();
        assert!(dir.path().join("tsconfig.json").exists());
        let tsconfig = std::fs::read_to_string(dir.path().join("tsconfig.json")).unwrap();
        assert!(tsconfig.contains("react-native"));
    }

    #[test]
    fn scaffold_flutter_docker_compose_has_expected_content() {
        let dir = tempfile::TempDir::new().unwrap();
        scaffold_mobile_flutter(dir.path(), &[("DISPLAY", ":0")]).unwrap();
        let dc = std::fs::read_to_string(dir.path().join("docker-compose.yml")).unwrap();
        assert!(dc.contains("cirrusci/flutter"));
        assert!(dc.contains("DISPLAY"));
    }
}
