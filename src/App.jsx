import React, { useState, useEffect, useCallback } from 'react';
import { getAuth, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';

// --- Global Constants and Firebase Setup ---
// These global variables are provided by the immersive environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Utility Functions ---

const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
};

// Helper to darken/lighten hex color for hover states
const adjustColor = (color, amount) => {
    if (!color) return color;
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

// Helper to generate rgba for transparent backgrounds
const hexToRgba = (hex, alpha) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    }
    return `rgba(${r},${g},${b},${alpha})`;
}

// --- Styling Constants ---
const COLOR_PRESETS = {
    indigo: '#4f46e5',
    pink: '#ec4899',
    teal: '#14b8a6',
    red: '#ef4444',
    orange: '#f97316',
    cyan: '#06b6d4'
};

const RANDOM_BUTTON_PRESETS = {
    amber: '#f59e0b',
    lime: '#84cc16',
    purple: '#a855f7',
    sky: '#0ea5e9'
};

const BG_PRESETS = {
    gray: '#f9fafb',
    blue: '#eff6ff',
    green: '#f0fdf4',
    neutral: '#f5f5f5',
    purple: '#faf5ff',
    pink: '#fdf2f8'
};

const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    
    // Style settings state
    const [settings, setSettings] = useState({
        accentColor: '#4f46e5', 
        bgColor: '#f9fafb',     
        randomColor: '#f59e0b', 
    });
    const [showSettings, setShowSettings] = useState(false);
    
    // UI States
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    const [input1, setInput1] = useState('');
    const [input2, setInput2] = useState('');
    const [image1Base64, setImage1Base64] = useState(null);
    const [image2Base64, setImage2Base64] = useState(null);

    const [resultName, setResultName] = useState('Il Grande Nascosto');
    const [resultTranslation, setResultTranslation] = useState('The Great Hidden One'); 
    const [resultImage, setResultImage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [error, setError] = useState(null);

    // 1. Firebase Initialization and Authentication
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestore);
            setAuth(firebaseAuth);

            if (initialAuthToken) {
                signInWithCustomToken(firebaseAuth, initialAuthToken)
                    .then((userCredential) => setUserId(userCredential.user.uid))
                    .catch(() => signInAnonymously(firebaseAuth).then((userCredential) => setUserId(userCredential.user.uid)));
            } else {
                signInAnonymously(firebaseAuth)
                    .then((userCredential) => setUserId(userCredential.user.uid));
            }
        } catch (e) {
            console.error("Firebase initialization failed:", e);
        }
    }, []);

    // 2. History Listener (Public Collection)
    useEffect(() => {
        if (!db || !userId) return;

        const historyPath = `artifacts/${appId}/public/data/fusions`;
        const q = query(collection(db, historyPath));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newHistory = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })).sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0)); 

            setHistory(newHistory);
        }, (err) => {
            console.error("Failed to fetch history:", err);
        });

        return () => unsubscribe();
    }, [db, userId]);

    // 3. API Call Logic (Calls the Vercel backend at /api/generate)
    const generateFusion = useCallback(async (isReroll = false, useRandom = false) => {
        if (isLoading) return;
        setIsLoading(true);
        setError(null);
        setResultImage(null); 

        const inputReady = (input1 || image1Base64) || (input2 || image2Base64);
        if (!inputReady && !isReroll) {
             setError("Please provide at least one word or image to start the fusion.");
             setIsLoading(false);
             return;
        }

        try {
            // --- Step 1: Construct the Gemini Payload for JSON structure ---
            let parts = [];
            let systemPrompt = "You are a creative fusion bot. Your task is to generate a single, highly creative and dramatic Italian-sounding name for a hybrid creature/object, its direct English translation, and a detailed visual prompt for an AI image generator. The visual prompt should describe a surreal, beautiful, high-quality image of the hybrid creature, suitable for an illustration style. Respond with only a single JSON object.";

            if (useRandom) {
                const primaryInput = input1 || 'a mystery object';
                const base64 = image1Base64 || image2Base64;
                let textQuery = `Generate an Italian-sounding merged name, its English translation, and a visual description for an artistic hybrid of a **${primaryInput}** and a **randomly chosen, dramatically different object**.`;

                if (base64) {
                     parts.push({ text: "The primary subject to fuse is in the image provided below." });
                     parts.push({ inlineData: { mimeType: "image/png", data: base64 } });
                     textQuery = `Identify the main subject in the image. Generate an Italian-sounding merged name, its English translation, and a visual description for an artistic hybrid of the identified subject and a **randomly chosen, dramatically different object**.`;
                }
                parts.push({ text: textQuery });
            } else {
                const textQuery = `Generate an Italian-sounding merged name, its English translation, and a visual description for an artistic hybrid of **${input1 || 'the first subject/image'}** and **${input2 || 'the second subject/image'}**.`;
                if (image1Base64) parts.push({ text: "Subject 1:", inlineData: { mimeType: "image/png", data: image1Base64 } });
                if (image2Base64) parts.push({ text: "Subject 2:", inlineData: { mimeType: "image/png", data: image2Base64 } });
                parts.push({ text: textQuery });
            }

            const geminiPayload = {
                contents: [{ parts: parts }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "italianName": { "type": "STRING" },
                            "englishTranslation": { "type": "STRING" },
                            "imagePrompt": { "type": "STRING" }
                        },
                        "propertyOrdering": ["italianName", "englishTranslation", "imagePrompt"]
                    }
                }
            };

            // --- Step 2: Call OUR backend function ---
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send the payload to the Vercel backend
                body: JSON.stringify({ geminiPayload }), 
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'The backend function failed with an unknown error.');
            }

            const result = await response.json();

            // --- Step 3: Set results from our backend's response ---
            setResultName(result.name);
            setResultTranslation(result.translation);
            setResultImage(result.imageUrl);

            // --- Step 4: Save fusion name to Firestore History ---
            if (db && userId) {
                const docRef = collection(db, `artifacts/${appId}/public/data/fusions`);
                await addDoc(docRef, {
                    name: result.name,
                    translation: result.translation,
                    prompt: "Generated via backend", 
                    input1: input1,
                    input2: input2,
                    userId: userId,
                    timestamp: serverTimestamp(),
                });
            }

        } catch (e) {
            console.error("Fusion generation error:", e);
            setError(`A server error occurred: ${e.message}. Please check your Vercel logs.`);
        } finally {
            setIsLoading(false);
        }
    }, [input1, input2, image1Base64, image2Base64, isLoading, db, userId]); 

    // 4. Input Handlers
    const handleImageChange = (e, setBase64, setTextInput) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                setError("Image file is too large. Max 2MB.");
                return;
            }
            setError(null);
            setBase64(null);
            setTextInput('');
            fileToBase64(file).then(setBase64).catch(() => setError("Failed to process image."));
        } else {
            setBase64(null);
        }
    };

    const handleTextChange = (e, setInput, setImageBase64) => {
        setInput(e.target.value);
        if (e.target.value) {
            setImageBase64(null); // Clear image if text is entered
        }
    }

    const handleClearInputs = () => {
        setInput1('');
        setInput2('');
        setImage1Base64(null);
        setImage2Base64(null);
        setResultName('Il Grande Nascosto');
        setResultTranslation('The Great Hidden One');
        setResultImage(null);
        setError(null);
    }
    
    // 5. Download Function
    const handleDownload = () => {
        if (resultImage) {
            const link = document.createElement('a');
            link.href = resultImage;
            link.download = `${resultName.replace(/ /g, '_')}_Fusion.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    // Determine the active generation state
    const isReadyToGenerate = (input1 || image1Base64) && (input2 || image2Base64);
    const isReadyForRandom = (input1 || image1Base64) || (input2 || image2Base64);

    return (
        <div className="min-h-screen p-4 font-sans" style={{ backgroundColor: settings.bgColor, color: '#1f2937' }}>
            <script src="https://cdn.tailwindcss.com"></script>
            {/* Inject Dynamic Hover Styles */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap');
                .font-display { font-family: 'Playfair Display', serif; }
                .font-body { font-family: 'Inter', sans-serif; }
                .glass-card {
                    background: rgba(255, 255, 255, 0.8);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
                }
                
                /* Custom Hover Classes for Accent Color */
                .hover-btn-accent:hover {
                    background-color: ${adjustColor(settings.accentColor, -20)} !important;
                }
                
                /* Custom Hover Classes for Random Button */
                .hover-btn-random:hover {
                    background-color: ${adjustColor(settings.randomColor, -20)} !important;
                }
            `}</style>

            <div className="max-w-7xl mx-auto py-10 font-body">
                <header className="text-center mb-12 relative">
                    <h1 className="text-5xl md:text-6xl font-extrabold font-display mb-2" style={{ color: adjustColor(settings.accentColor, -40) }}>
                        Creatore di Fusioni
                    </h1>
                    <p className="text-xl text-gray-600">
                        Merge two concepts into one magnificent Italian-sounding hybrid.
                    </p>
                    {userId && <p className="text-xs mt-1 text-gray-400">User ID: {userId}</p>}
                    
                    {/* Settings Button */}
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="absolute top-0 right-0 p-3 rounded-full bg-white shadow-md transition-colors duration-200 hover:bg-gray-100"
                        style={{ color: settings.accentColor, borderColor: settings.accentColor, borderWidth: '1px' }}
                        title="Style Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </header>

                {/* Settings Drawer */}
                <SettingsDrawer 
                    show={showSettings} 
                    onClose={() => setShowSettings(false)} 
                    settings={settings} 
                    setSettings={setSettings}
                />
                
                {/* MAIN LAYOUT */}
                <main className="grid lg:grid-cols-2 gap-8">
                    
                    {/* COLUMN 1: INPUTS */}
                    <div className="space-y-8 order-last lg:order-first">
                        
                        {/* Input Cards (STACKED VERTICALLY) */}
                        <div className="space-y-6">
                            <InputCard 
                                title="Concept 1: Word or Image"
                                input={input1}
                                setInput={(e) => handleTextChange(e, setInput1, setImage1Base64)}
                                imageBase64={image1Base64}
                                handleImageChange={(e) => handleImageChange(e, setImage1Base64, setInput1)}
                                isLoading={isLoading}
                                accentColor={settings.accentColor}
                            />

                            <InputCard 
                                title="Concept 2: Word or Image"
                                input={input2}
                                setInput={(e) => handleTextChange(e, setInput2, setImage2Base64)}
                                imageBase64={image2Base64}
                                handleImageChange={(e) => handleImageChange(e, setImage2Base64, setInput2)}
                                isLoading={isLoading}
                                accentColor={settings.accentColor}
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-4 justify-center p-4 glass-card rounded-xl">
                             <button
                                onClick={() => generateFusion(false, false)}
                                disabled={isLoading || !isReadyToGenerate}
                                className={`px-6 py-3 text-lg font-bold text-white transition-all duration-300 rounded-full shadow-lg hover-btn-accent`}
                                style={{
                                    backgroundColor: isReadyToGenerate && !isLoading ? settings.accentColor : '#9ca3af',
                                    cursor: isReadyToGenerate && !isLoading ? 'pointer' : 'not-allowed'
                                }}
                            >
                                {isLoading ? (
                                    <span className="flex items-center">
                                        <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Forging Name...
                                    </span>
                                ) : (
                                    'Fuse Concepts'
                                )}
                            </button>
                            
                            <button
                                onClick={() => generateFusion(false, true)}
                                disabled={isLoading || !isReadyForRandom || isReadyToGenerate}
                                className={`px-6 py-3 text-lg font-bold text-white transition-all duration-300 rounded-full shadow-lg hover-btn-random`}
                                style={{
                                    backgroundColor: isReadyForRandom && !isReadyToGenerate && !isLoading ? settings.randomColor : '#d1d5db',
                                    cursor: isReadyForRandom && !isReadyToGenerate && !isLoading ? 'pointer' : 'not-allowed'
                                }}
                            >
                                Merge with Random
                            </button>

                            <button
                                onClick={handleClearInputs}
                                className="px-6 py-3 text-lg font-bold text-gray-700 bg-gray-200 rounded-full hover:bg-gray-300 transition-colors duration-200 shadow-md"
                                disabled={isLoading}
                            >
                                Clear Inputs
                            </button>
                        </div>

                        {error && (
                            <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg shadow-md">
                                <p className="font-bold">Error:</p>
                                <p>{error}</p>
                            </div>
                        )}
                    </div>

                    {/* COLUMN 2: OUTPUTS */}
                    <div className="space-y-8 order-first lg:order-last">
                    
                        {/* Result Panel */}
                        <div className="p-6 glass-card rounded-xl shadow-lg relative z-20 lg:sticky lg:top-4">
                            <h2 className="text-3xl font-display font-bold text-center mb-4" style={{ color: adjustColor(settings.accentColor, -40) }}>
                                The Result
                            </h2>
                            
                            {/* IMAGE CONTAINER */}
                            <div 
                                className="max-w-sm aspect-square bg-gray-100 rounded-lg overflow-hidden border-4 border-dashed flex items-center justify-center relative mx-auto"
                                style={{ borderColor: hexToRgba(settings.accentColor, 0.4) }}
                            >
                                {isLoading ? (
                                    <div className="text-center p-8">
                                        <svg className="animate-spin h-10 w-10 mx-auto" style={{ color: settings.accentColor }} viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        <p className="mt-4 text-gray-600 font-semibold">
                                            {resultName.startsWith('Il') ? 'Generating Image...' : `Naming: ${resultName}`}
                                        </p>
                                    </div>
                                ) : resultImage ? (
                                    <img 
                                        src={resultImage} 
                                        alt={resultName} 
                                        className="w-full h-full object-cover" 
                                    />
                                ) : (
                                    <div className="text-center text-gray-500 italic">
                                        Your magnificent fusion will appear here.
                                    </div>
                                )}
                            </div>

                            <h3 className="text-4xl font-display font-extrabold text-center mt-6 break-words" style={{ color: adjustColor(settings.accentColor, -20) }}>
                                {resultName}
                            </h3>
                            
                            {/* NEW: English Translation */}
                            <p className="text-lg text-center font-medium italic mt-2" style={{ color: adjustColor(settings.accentColor, -10) }}>
                                ({resultTranslation})
                            </p>

                            <div className="flex gap-4 mt-6 justify-center">
                                <button
                                    onClick={() => generateFusion(true, !input2 && !image2Base64)}
                                    disabled={isLoading || !resultImage}
                                    className="flex items-center px-4 py-2 font-bold text-white rounded-full transition-all duration-300 shadow-md hover:opacity-90"
                                    style={{ 
                                        backgroundColor: resultImage && !isLoading ? '#16a34a' : '#86efac',
                                        cursor: resultImage && !isLoading ? 'pointer' : 'not-allowed'
                                    }}
                                    title="Generate a different result based on the same inputs"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.9 7.098V9a1 1 0 01-2 0V3a1 1 0 011-1zm.099 15.499A7.002 7.002 0 0116 12.899v-2.101a1 1 0 012 0v6a1 1 0 01-1 1h-6a1 1 0 010-2h2.101a5.002 5.002 0 00-8.857-1.874 1 1 0 01-.666 1.885z" clipRule="evenodd" /></svg>
                                    Re-Roll
                                </button>
                                
                                <button
                                    onClick={handleDownload}
                                    disabled={!resultImage}
                                    className="flex items-center px-4 py-2 font-bold text-white rounded-full transition-all duration-300 shadow-md hover:opacity-90"
                                    style={{
                                        backgroundColor: resultImage ? '#2563eb' : '#93c5fd',
                                        cursor: resultImage ? 'pointer' : 'not-allowed'
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L10 11.586l1.293-1.293a1 1 0 111.414 1.414l-2 2a1 1 0 01-1.414 0l-2-2a1 1 0 010-1.414z" clipRule="evenodd" /><path fillRule="evenodd" d="M10 2a1 1 0 011 1v8a1 1 0 11-2 0V3a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    Download
                                </button>
                            </div>
                        </div>

                        {/* COLLAPSIBLE HISTORY PANEL */}
                        <div className="glass-card rounded-xl shadow-lg overflow-hidden">
                            <button 
                                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                                className="w-full p-4 flex justify-between items-center font-display font-bold text-lg hover:bg-white/50 transition-colors"
                                style={{ color: adjustColor(settings.accentColor, -40) }}
                            >
                                <span>Fusion History</span>
                                <svg 
                                    xmlns="http://www.w3.org/2000/svg" 
                                    className={`h-6 w-6 transform transition-transform duration-300 ${isHistoryOpen ? 'rotate-180' : ''}`} 
                                    fill="none" 
                                    viewBox="0 0 24 24" 
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            
                            {isHistoryOpen && (
                                <div className="p-4 border-t border-gray-200 h-64 overflow-y-auto space-y-3 bg-white/50">
                                    {history.length === 0 ? (
                                        <p className="text-gray-500 italic">No fusions created yet. Start forging!</p>
                                    ) : (
                                        history.map((item) => (
                                            <div key={item.id} className="p-3 bg-white rounded-lg shadow-sm">
                                                <p className="font-bold text-lg" style={{ color: settings.accentColor }}>{item.name}</p>
                                                {item.translation && <p className="text-sm font-medium italic text-gray-600">({item.translation})</p>}
                                                <p className="text-sm text-gray-500 truncate mt-1">{item.prompt}</p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Inputs: {item.input1 || '[Image 1]'} & {item.input2 || '[Image 2]'}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

// --- REUSABLE COMPONENT FOR SETTINGS SECTIONS ---
const ColorSection = ({ title, settingKey, presets, settings, handleSettingChange, hasPicker = true }) => (
    <div className="mb-6">
        <h4 className="font-semibold mb-2 text-lg">{title}</h4>
        <div className="flex gap-3 flex-wrap items-center">
            {Object.entries(presets).map(([name, color]) => (
                <button
                    key={name}
                    onClick={() => handleSettingChange(settingKey, color)}
                    className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        settings[settingKey] === color ? 'scale-110 border-black' : 'border-white hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={name.charAt(0).toUpperCase() + name.slice(1)}
                ></button>
            ))}
            
            {hasPicker && (
                <div className="relative group">
                    <label className="w-8 h-8 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center cursor-pointer hover:border-gray-400 overflow-hidden">
                        <input 
                            type="color" 
                            value={settings[settingKey]} 
                            onChange={(e) => handleSettingChange(settingKey, e.target.value)}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer" 
                        />
                        {/* Color Wheel Icon */}
                        <div className="w-full h-full bg-[conic-gradient(red,orange,yellow,green,blue,indigo,violet,red)] opacity-50"></div>
                    </label>
                </div>
            )}
        </div>
        <p className="text-xs text-gray-400 mt-1">Current: {settings[settingKey]}</p>
    </div>
);

// --- Component for Settings Drawer ---
const SettingsDrawer = ({ show, onClose, settings, setSettings }) => {
    
    // Function to update settings
    const handleSettingChange = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div 
            className={`fixed inset-0 z-50 transition-opacity duration-300 ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            {/* Overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
            
            {/* Drawer */}
            <div 
                className={`fixed top-0 right-0 w-80 h-full bg-white shadow-2xl p-6 transform transition-transform duration-300 overflow-y-auto ${
                    show ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h3 className="text-2xl font-display font-bold">Style Settings</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <ColorSection 
                    title="Accent Color" 
                    settingKey="accentColor" 
                    presets={COLOR_PRESETS}
                    settings={settings}
                    handleSettingChange={handleSettingChange}
                />

                <ColorSection 
                    title="Random Button Color" 
                    settingKey="randomColor" 
                    presets={RANDOM_BUTTON_PRESETS} 
                    settings={settings}
                    handleSettingChange={handleSettingChange}
                />

                <ColorSection 
                    title="Page Background" 
                    settingKey="bgColor" 
                    presets={BG_PRESETS} 
                    settings={settings}
                    handleSettingChange={handleSettingChange}
                />

            </div>
        </div>
    );
};

// --- Component for Input Card ---
const InputCard = ({ title, input, setInput, imageBase64, handleImageChange, isLoading, accentColor }) => {
    const cardBorderColor = hexToRgba(accentColor, 0.2);
    const titleColor = adjustColor(accentColor, -20); 

    return (
        <div className="p-6 glass-card rounded-xl shadow-lg" style={{ borderColor: cardBorderColor }}>
            <h3 className="text-xl font-display font-semibold mb-4" style={{ color: titleColor }}>{title}</h3>
            
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Enter Word:</label>
                <input
                    type="text"
                    value={input}
                    onChange={setInput}
                    placeholder="e.g., Cat, Bicycle, Star"
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-1"
                    style={{ 
                        borderColor: input ? accentColor : '#d1d5db',
                        boxShadow: input ? `0 0 0 1px ${accentColor}` : 'none'
                    }}
                    disabled={isLoading || !!imageBase64}
                />
            </div>

            <div className="relative border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Or Upload Image:</label>
                <label 
                    className={`flex justify-center w-full h-24 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200`}
                    style={{
                        backgroundColor: !input && !imageBase64 ? hexToRgba(accentColor, 0.05) : '#f3f4f6',
                        borderColor: !input && !imageBase64 ? hexToRgba(accentColor, 0.5) : '#d1d5db',
                        cursor: isLoading || !!input ? 'not-allowed' : 'pointer'
                    }}
                >
                    <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleImageChange} 
                        disabled={isLoading || !!input} 
                    />
                    <span className="flex items-center text-center text-gray-500">
                        {imageBase64 ? 'Image Uploaded! (Clear text to change)' : 'Click to upload image (Clears text)'}
                    </span>
                </label>
                
                {imageBase64 && (
                    <div 
                        className="mt-4 w-20 h-20 overflow-hidden rounded-lg mx-auto border-2 shadow-md"
                        style={{ borderColor: accentColor }}
                    >
                        <img src={`data:image/png;base64,${imageBase64}`} alt="Concept preview" className="w-full h-full object-cover" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;