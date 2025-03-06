const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const ProcessPlugin = require('process');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: './browser-client.js',
    output: {
        filename: 'uniroad-bundle.js',
        path: path.resolve(__dirname, 'docs'),
        clean: true,
    },
    resolve: {
        fallback: {
            "crypto": require.resolve("crypto-browserify"),
            "stream": require.resolve("stream-browserify"),
            "buffer": require.resolve("buffer/"),
            "util": require.resolve("util/"),
            "path": require.resolve("path-browserify"),
            "fs": require.resolve("browserify-fs"),
            "http": require.resolve("stream-http"),
            "https": require.resolve("https-browserify"),
            "os": require.resolve("os-browserify/browser"),
            "zlib": require.resolve("browserify-zlib"),
            "vm": require.resolve("vm-browserify"),
            "process": require.resolve("process")
        }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: '> 0.25%, not dead',
                                useBuiltIns: 'usage',
                                corejs: 3
                            }]
                        ],
                        plugins: ['@babel/plugin-transform-runtime']
                    }
                }
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader']
            }
        ]
    },
    plugins: [
        // Fix process is not defined
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
            process: 'process'
        }),
        // Polyfill Node.js globals
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
        }),
        // Generate HTML file
        new HtmlWebpackPlugin({
            template: './index.html',
            filename: 'index.html',
            inject: true,
            minify: {
                collapseWhitespace: true,
                removeComments: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                useShortDoctype: true
            }
        }),
        // Extract CSS
        new MiniCssExtractPlugin({
            filename: 'styles.css'
        }),
        // Copy static assets
        new CopyPlugin({
            patterns: [
                { from: './styles.css', to: 'styles.css' }
            ],
        })
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    format: {
                        comments: false,
                    },
                    compress: {
                        drop_console: false,
                    },
                },
                extractComments: false,
            }),
        ],
    },
    performance: {
        hints: false
    }
};